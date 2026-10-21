import "server-only";
/**
 * One assistant turn: save the lawyer's message, replay the thread to the model, run READ tools at once,
 * gather the WRITE tool calls of each round into ONE proposal (confirmation card). Nothing is written to
 * the content tables here — only chat_messages + proposals. Takes `db` (no cookies) so scripts can call it.
 *
 * Storage: assistant rows keep tool_calls = {calls, raw} (raw = provider parts incl. thought signatures,
 * sent back unchanged); tool rows keep tool_calls = {results}. A card's proposal points at its assistant row.
 */
import { formatDmy, normalizeDigits, todayIso } from "@/lib/dates";
import type { Json } from "@/lib/db/types";
import { caseLabel } from "@/lib/labels";
import { getLlm, LlmUnavailableError, SpendCapError, type LlmMessage, type LlmToolCall } from "@/lib/llm";
import { UNAVAILABLE_TEXT } from "@/lib/llm/unavailable";
import { createProposal, normalizeForMatch, type DraftOp, type Proposal } from "@/lib/proposals";
import type { Db } from "@/lib/supabase/server";
import { isReadTool, READ_TOOL_SPECS, runReadTool } from "@/lib/tools/read";
import { isWriteTool, OP_TITLE, WRITE_TOOL_ARGS, writeToolSpecs } from "@/lib/tools/registry";
import { buildSystemPrompt, type CaseContext } from "./prompt";

const MAX_ROUNDS = 6;
const HISTORY = 40;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Write-tool args that hold a reference (uuid or «@ref»); other string args are free text and may start with "@". */
const REF_KEYS = ["case", "client", "hearing", "document", "previous_stage_case"];
export const PROPOSED_RESULT = "اقتراح بانتظار تأكيد المحامي — لا تكرره";

interface StoredAssistant { calls?: LlmToolCall[]; raw?: unknown }
interface StoredTool { results?: { callId: string; name: string; result: unknown }[] }

export interface TurnResult {
  userMessageId: string;
  assistantMessageIds: string[];
  proposalIds: string[];
  text: string;
  rounds: number;
  error?: string;
}

/** Thrown by runAssistantTurn; `userMessageSaved` tells the UI whether the lawyer's text is already in the thread. */
export class TurnError extends Error {
  constructor(message: string, readonly userMessageSaved: boolean) {
    super(message);
  }
}

type TurnInput = { threadId: string; userText: string; userId: string; officeId: string };

export async function runAssistantTurn(db: Db, input: TurnInput): Promise<TurnResult> {
  const state = { saved: false };
  try {
    return await turn(db, input, state);
  } catch (e) {
    throw new TurnError(e instanceof Error ? e.message : String(e), state.saved);
  }
}

async function turn(db: Db, input: TurnInput, state: { saved: boolean }): Promise<TurnResult> {
  const text = input.userText.trim();
  if (!text) throw new Error("الرسالة فارغة");
  const { data: thread, error: te } = await db.from("chat_threads").select("id, case_id, title").eq("id", input.threadId).single();
  if (te || !thread) throw new Error("المحادثة غير موجودة");

  const { data: userMsg, error: ue } = await db.from("chat_messages").insert({ thread_id: thread.id, role: "user", content: text }).select("id, created_at").single();
  if (ue || !userMsg) throw new Error(ue?.message ?? "تعذّر حفظ الرسالة");
  state.saved = true;
  await db.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", thread.id);

  const [history, caseContext, cardNotes, docs, sourceTexts, docPages] = await Promise.all([
    loadHistory(db, thread.id),
    thread.case_id ? loadCaseContext(db, thread.case_id) : Promise.resolve(null),
    loadCardNotes(db, thread.id),
    db.from("documents").select("id, file_name, page_count, read_status").eq("thread_id", thread.id).order("created_at").then((r) => r.data ?? []),
    loadSourceTexts(db, thread.id),
    loadDocPages(db, thread.id),
  ]);

  const system = buildSystemPrompt({ caseContext, cardNotes, documents: docs });
  const tools = [...READ_TOOL_SPECS, ...writeToolSpecs()];
  const messages: LlmMessage[] = history;
  const meta = { purpose: "chat" as const, officeId: input.officeId, userId: input.userId, threadId: thread.id };
  const out: TurnResult = { userMessageId: userMsg.id, assistantMessageIds: [], proposalIds: [], text: "", rounds: 0 };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let res;
    try {
      res = await getLlm().chat({ system, messages, tools, meta });
    } catch (e) {
      // already logged once in llm_calls (getLlm); one notice in the chat, no retry
      const msg = e instanceof Error ? e.message : String(e);
      // a turn cut short leaves nothing half-done: drop this turn's cards (nothing in them is saved — they wait for
      // the tap) and its partial replies, so the thread shows the lawyer's message and the notice only
      if (out.proposalIds.length) await db.from("proposals").delete().in("id", out.proposalIds).eq("status", "pending");
      if (round > 0) await db.from("chat_messages").delete().eq("thread_id", thread.id).in("role", ["assistant", "tool"]).gt("created_at", userMsg.created_at);
      out.proposalIds = [];
      out.assistantMessageIds = [];
      // only "not available now" (402 / 429 / 5xx / timeout / network) gets the notice; any other error (a bad request,
      // a blocked reply) is a fault to fix, so it keeps a plain message and its reason in llm_calls
      const friendly = e instanceof SpendCapError ? "مش هقدر أرد دلوقتي: وصلنا لحد الصرف التجريبي."
        : e instanceof LlmUnavailableError ? UNAVAILABLE_TEXT
        : "حصلت مشكلة وأنا بجهّز الرد. جرّب تكتبها تاني بشكل مختلف.";
      const { data: m } = await db.from("chat_messages").insert({ thread_id: thread.id, role: "assistant", content: friendly }).select("id").single();
      if (m) out.assistantMessageIds.push(m.id);
      out.text = friendly;
      out.error = msg;
      return out;
    }
    out.rounds = round + 1;
    const calls = res.toolCalls;
    const stored: StoredAssistant | null = calls.length ? { calls, raw: res.raw } : null;
    const { data: am, error: ae } = await db.from("chat_messages")
      .insert({ thread_id: thread.id, role: "assistant", content: res.text ?? "", tool_calls: stored as unknown as Json })
      .select("id").single();
    if (ae || !am) throw new Error(ae?.message ?? "تعذّر حفظ رد Clausia");
    out.assistantMessageIds.push(am.id);
    if (res.text) out.text = out.text ? `${out.text}\n${res.text}` : res.text;
    messages.push({ role: "assistant", text: res.text ?? "", toolCalls: calls, raw: res.raw });
    if (!calls.length) break;

    const results = new Map<string, unknown>();
    const drafts: { call: LlmToolCall; op: DraftOp }[] = [];
    const refsInCard = new Set<string>();

    for (const call of calls) {
      if (isReadTool(call.name)) {
        try {
          results.set(call.id, await runReadTool(db, call.name, call.args));
        } catch (e) {
          results.set(call.id, { error: e instanceof Error ? e.message : String(e) });
        }
        continue;
      }
      if (!isWriteTool(call.name)) {
        results.set(call.id, { error: `أداة غير معروفة: ${call.name}` });
        continue;
      }
      const parsed = WRITE_TOOL_ARGS[call.name].safeParse(call.args);
      if (!parsed.success) {
        results.set(call.id, { error: `لم يُقترح: ${parsed.error.issues.map((i) => `${i.path.join(".") || "args"}: ${i.message}`).join("؛ ")}. صحّح الاستدعاء إن كان الخطأ واضحًا، وإلا اسأل المحامي ولا تخمّن.` });
        continue;
      }
      // "@ref" must point at an item proposed earlier in this same card
      const missing = Object.entries(call.args)
        .filter(([k, v]) => REF_KEYS.includes(k) && typeof v === "string" && v.startsWith("@") && !refsInCard.has(v.slice(1)))
        .map(([, v]) => v as string);
      if (missing.length) {
        results.set(call.id, { error: `لم يُقترح: المرجع ${missing.join("، ")} غير موجود في هذه البطاقة. استخدم معرّفًا محفوظًا أو أنشئ العنصر بـ ref في نفس الجولة.` });
        continue;
      }
      const badId = Object.entries(call.args).filter(([k, v]) => REF_KEYS.includes(k) && typeof v === "string" && !v.startsWith("@") && !UUID.test(v));
      if (badId.length) {
        results.set(call.id, { error: `لم يُقترح: ${badId.map(([k]) => k).join("، ")} يجب أن يكون معرّفًا (uuid) أو «@مرجع». ابحث عنه أولًا.` });
        continue;
      }
      // never guess: a date / year / number / court / circuit must be in the lawyer's words or an attached paper
      const unsupported = notInSource(call.args, [text, ...sourceTexts]);
      if (unsupported.length) {
        results.set(call.id, { error: `لم يُقترح: ${unsupported.join("؛ ")}. اسأل المحامي سؤال واحد قصير ومتخمّنش.` });
        continue;
      }
      const ref = call.args.ref;
      if (typeof ref === "string" && ref) refsInCard.add(ref);
      drafts.push({
        call,
        op: { tool: call.name, args: call.args, source: sourceOf((call.args.quote as string | undefined) ?? null, text, userMsg.id, docPages) },
      });
    }

    if (drafts.length) {
      const caseId = thread.case_id ?? firstCaseUuid(drafts.map((x) => x.op));
      try {
        const proposal: Proposal = await createProposal(db, { threadId: thread.id, messageId: am.id, caseId, ops: drafts.map((x) => x.op), sourceTexts: [...sourceTexts, text] });
        out.proposalIds.push(proposal.id);
        for (const x of drafts) results.set(x.call.id, { status: PROPOSED_RESULT, card_id: proposal.id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        for (const x of drafts) results.set(x.call.id, { error: `لم يُقترح: ${msg}` });
      }
    }

    const toolResults = calls.map((c) => ({ callId: c.id, name: c.name, result: results.get(c.id) ?? { error: "لا نتيجة" } }));
    const storedTool: StoredTool = { results: toolResults };
    await db.from("chat_messages").insert({ thread_id: thread.id, role: "tool", content: "", tool_calls: storedTool as unknown as Json });
    messages.push({ role: "tool", results: toolResults });
  }

  // never leave the lawyer with silence: say what happened even if the model spent every round on lookups
  if (!out.text.trim()) {
    let reply = "";
    if (out.proposalIds.length) {
      reply = "جهّزت لك بطاقة تأكيد. راجعها، ولما توافق أحفظها. مفيش حاجة اتحفظت لسه.";
    } else {
      try {
        const r = await getLlm().chat({ system: `${system}\n\nاكتب دلوقتي رد قصير للمحامي بالعامية المصرية: لقيت إيه ومحتاج منه إيه، من غير ما تستدعي أدوات.`, messages: [...messages, { role: "user", text: "لخّص لي اللي وصلتله وقولّي محتاج مني إيه." }], meta });
        reply = r.text?.trim() ?? "";
      } catch (e) {
        if (e instanceof LlmUnavailableError) reply = UNAVAILABLE_TEXT;
      }
      if (!reply) reply = "راجعت اللي عندي ولسه محتاج خطوة كمان. اكتب «كمّل» وأنا أجهّز البطاقة.";
    }
    const { data: m } = await db.from("chat_messages").insert({ thread_id: thread.id, role: "assistant", content: reply }).select("id").single();
    if (m) out.assistantMessageIds.push(m.id);
    out.text = reply;
  }
  return out;
}

type DocPage = { document_id: string; page_no: number; text: string; norm: string };

/** Pages of the papers attached to this thread (to tell a paper's quote from the lawyer's own words). */
async function loadDocPages(db: Db, threadId: string): Promise<DocPage[]> {
  const { data: docs } = await db.from("documents").select("id").eq("thread_id", threadId);
  const ids = (docs ?? []).map((d) => d.id);
  if (!ids.length) return [];
  const { data } = await db.from("document_pages").select("document_id, page_no, text").in("document_id", ids);
  return (data ?? []).map((p) => ({ ...p, norm: normalizeForMatch(p.text) }));
}

/** A quote found in an attached paper (and not in the lawyer's message) keeps the paper + page as its source. */
function sourceOf(quote: string | null, lawyerText: string, messageId: string, pages: DocPage[]): DraftOp["source"] {
  const q = quote ? normalizeForMatch(quote) : "";
  if (q.length >= 6 && !normalizeForMatch(lawyerText).includes(q)) {
    const hit = pages.find((p) => p.norm.includes(q));
    if (hit) return { kind: "document", document_id: hit.document_id, page: hit.page_no, quote };
  }
  return { kind: "chat", message_id: messageId, quote };
}

function firstCaseUuid(ops: DraftOp[]): string | null {
  for (const o of ops) {
    const v = o.args.case;
    if (typeof v === "string" && UUID.test(v)) return v;
  }
  return null;
}

/**
 * Last ~40 messages as LlmMessages. Gemini needs every functionCall followed by its functionResponse, so an
 * assistant row with calls is replayed with its raw parts only when the next row holds its results; otherwise
 * it is replayed as plain text. The window always starts at a user message.
 */
async function loadHistory(db: Db, threadId: string): Promise<LlmMessage[]> {
  const { data } = await db.from("chat_messages").select("id, role, content, tool_calls, attachments, created_at")
    .eq("thread_id", threadId).order("created_at", { ascending: false }).limit(HISTORY);
  const rows = (data ?? []).reverse();
  const start = rows.findIndex((r) => r.role === "user");
  const win = start < 0 ? [] : rows.slice(start);
  const out: LlmMessage[] = [];
  for (let i = 0; i < win.length; i++) {
    const r = win[i];
    if (r.role === "user") {
      const att = Array.isArray(r.attachments) ? (r.attachments as { document_id?: string; file_name?: string }[]) : [];
      const note = att.length ? `\n[مرفقات: ${att.map((a) => `${a.file_name ?? "مستند"} (document_id = ${a.document_id})`).join("، ")}]` : "";
      out.push({ role: "user", text: `${r.content}${note}` });
    } else if (r.role === "assistant") {
      const s = (r.tool_calls ?? null) as StoredAssistant | null;
      const next = win[i + 1];
      const answered = s?.calls?.length && next?.role === "tool" && ((next.tool_calls as StoredTool | null)?.results?.length ?? 0) > 0;
      if (answered) {
        out.push({ role: "assistant", text: r.content, toolCalls: s!.calls, raw: s!.raw });
        out.push({ role: "tool", results: (next.tool_calls as StoredTool).results! });
        i++;
      } else if (r.content && r.content !== UNAVAILABLE_TEXT) {
        out.push({ role: "assistant", text: r.content });
      }
    }
    // orphan tool rows are skipped
  }
  return out;
}

async function loadCaseContext(db: Db, caseId: string): Promise<CaseContext | null> {
  const { data: c } = await db.from("cases").select("id, case_number, case_year, title, court, circuit, client_id, facts_date, facts_date_precision").eq("id", caseId).maybeSingle();
  if (!c) return null;
  const today = todayIso();
  const [client, parties, hearings] = await Promise.all([
    c.client_id ? db.from("clients").select("id, name").eq("id", c.client_id).maybeSingle().then((r) => r.data) : Promise.resolve(null),
    db.from("case_parties").select("id, name, role").eq("case_id", caseId).order("created_at").then((r) => r.data ?? []),
    db.from("hearings").select("id, hearing_date, purpose, decision_type").eq("case_id", caseId).order("hearing_date").then((r) => r.data ?? []),
  ]);
  return {
    id: c.id, label: caseLabel(c), court: c.court, circuit: c.circuit, factsDate: c.facts_date ? formatDmy(c.facts_date, c.facts_date_precision) : null, client,
    parties,
    hearings: hearings.filter((h) => !h.decision_type || h.hearing_date >= today)
      .map((h) => ({ id: h.id, date: formatDmy(h.hearing_date), purpose: h.purpose, decided: !!h.decision_type })),
  };
}

const STATUS_NOTE: Record<string, string> = { pending: "بانتظار التأكيد", confirmed: "حُفظ", suggested: "حُفظ كمقترح", rejected: "رفضه المحامي", failed: "تعذّر الحفظ" };

/** What happened to each card in the thread, with the new ids, so the model can refer to saved items. */
async function loadCardNotes(db: Db, threadId: string): Promise<string[]> {
  const { data } = await db.from("proposals").select("id, ops, status, created_at").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(10);
  const props = (data ?? []).reverse() as unknown as Pick<Proposal, "id" | "ops" | "status">[];
  const decisionIds = props.flatMap((p) => p.ops.filter((o) => o.tool === "record_decision" && o.result_id && (o.status === "confirmed" || o.status === "suggested")).map((o) => o.result_id!));
  const next = new Map<string, string>();
  if (decisionIds.length) {
    const { data: hs } = await db.from("hearings").select("id, next_hearing_id").in("id", decisionIds);
    for (const h of hs ?? []) if (h.next_hearing_id) next.set(h.id, h.next_hearing_id);
  }
  return props.map((p, i) => {
    const ops = p.ops.map((o) => {
      const a = o.args as Record<string, unknown>;
      const what = [a.name, a.case_number && `رقم ${a.case_number}${a.case_year ? ` لسنة ${a.case_year}` : ""}`, a.date, a.next_date && `القادمة ${a.next_date}`, typeof a.text === "string" ? a.text.slice(0, 40) : null]
        .filter(Boolean).join(" ");
      const ids = o.result_id ? ` (id = ${o.result_id}${next.has(o.result_id) ? `، الجلسة القادمة id = ${next.get(o.result_id)}` : ""})` : "";
      return `${o.op_id} ${o.tool} [${OP_TITLE[o.tool] ?? o.tool}${what ? `: ${what}` : ""}] → ${STATUS_NOTE[o.status] ?? o.status}${ids}${o.error ? ` — ${o.error}` : ""}`;
    });
    return `- بطاقة ${i + 1}: ${ops.join("؛ ")}`;
  });
}

/** Texts the quotes may come from: every lawyer message in the thread + pages of documents uploaded here. */
async function loadSourceTexts(db: Db, threadId: string): Promise<string[]> {
  const [{ data: msgs }, { data: docs }] = await Promise.all([
    db.from("chat_messages").select("content").eq("thread_id", threadId).eq("role", "user"),
    db.from("documents").select("id").eq("thread_id", threadId),
  ]);
  const texts = (msgs ?? []).map((m) => m.content);
  const ids = (docs ?? []).map((d) => d.id);
  if (ids.length) {
    const { data: pages } = await db.from("document_pages").select("text").in("document_id", ids);
    for (const p of pages ?? []) texts.push(p.text);
  }
  return texts;
}

const DATE_KEYS = ["date", "facts_date", "next_date", "appeal_deadline"] as const;
const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل|ابريل", "مايو", "يونيو", "يوليو", "أغسطس|اغسطس", "سبتمبر", "أكتوبر|اكتوبر", "نوفمبر", "ديسمبر"];

/** Which proposed values are not backed by the source texts (lawyer's messages + attached papers). */
export function notInSource(args: Record<string, unknown>, texts: string[]): string[] {
  const src = normalizeDigits(texts.join("\n"));
  const norm = normalizeForMatch(src);
  const out: string[] = [];
  for (const k of DATE_KEYS) {
    const v = args[k];
    if (typeof v !== "string" || !v.trim()) continue;
    const p = normalizeDigits(v).split(/[/\-.]/).map((x) => x.trim()).filter(Boolean);
    const year = p.at(-1) ?? "";
    if (year && !src.includes(year)) { out.push(`السنة ${year} في «${v}» مش مذكورة`); continue; }
    if (p.length === 3) {
      const [d, m] = p;
      const numeric = new RegExp(`(^|\\D)0?${d}\\s*[/\\-.]\\s*0?${m}(\\D|$)`).test(src);
      const named = new RegExp(`(^|\\D)0?${d}\\s+(${AR_MONTHS[Number(m) - 1] ?? "x"})`).test(src);
      const iso = new RegExp(`${year}\\s*-\\s*0?${m}\\s*-\\s*0?${d}(\\D|$)`).test(src);
      if (!numeric && !named && !iso) out.push(`التاريخ «${v}» مش مذكور كده`);
    }
  }
  for (const k of ["case_number", "case_year"] as const) {
    const v = args[k];
    if (v !== undefined && v !== null && String(v).trim() && !src.includes(normalizeDigits(String(v)).trim())) out.push(`${k === "case_number" ? "رقم الدعوى" : "سنة الدعوى"} «${v}» مش مذكور`);
  }
  {
    // court: must be named AS a court («محكمة جنوب الجيزة …» / «المحكمة الاقتصادية …»), not just a place
    // («بمدينة نصر»). Also accepted: the name alone when it says what kind of court it is («استئناف القاهرة»,
    // «جنوب الجيزة الابتدائية»).
    const v = args.court;
    if (typeof v === "string" && v.trim()) {
      const fold = (x: string) => normalizeForMatch(x.replace(/(^|\s)المحكم[ةه](?=\s)/g, "$1محكمة"));
      const srcF = fold(src);
      const base = v.trim().replace(/^(ال)?محكم[ةه]\s+/, "");
      const short = base.replace(/\s+(الابتدائي[ةه]|الجزئي[ةه]|الكلي[ةه])(?=\s|$)/g, "").trim();
      const kind = /استئناف|ابتدائي|جزئي|كلي|اقتصادي|إداري|اداري|أسر[ةه]|اسر[ةه]|نقض|جنايات|جنح|عمال/.test(base);
      const ok = [`محكمة ${base}`, `محكمة ${short}`].some((x) => srcF.includes(fold(x))) || (kind && base.split(/\s+/).length > 1 && srcF.includes(fold(base)));
      if (!ok) out.push(`المحكمة «${v}» مش مذكورة بالاسم`);
    }
    // circuit: its number / name must be there, next to the word «دائرة» when it is only a number
    const c = args.circuit;
    if (typeof c === "string" && c.trim()) {
      const core = normalizeForMatch(c.replace(/الدائر[ةه]|دائر[ةه]|مدني|كلي/g, " "));
      const found = /^\d+$/.test(core)
        ? new RegExp(`دائر[ةه]\\s*(رقم\\s*)?${core}(\\D|$)`).test(norm)
        : !!core && norm.includes(core);
      if (core && !found) out.push(`الدائرة «${c}» مش مذكورة`);
    }
  }
  return out;
}
