import "server-only";
/**
 * One assistant turn: save the lawyer's message, replay the thread to the model, run READ tools at once,
 * gather the WRITE tool calls of each round into ONE proposal (confirmation card). Nothing is written to
 * the content tables here — only chat_messages + proposals. Takes `db` (no cookies) so scripts can call it.
 *
 * Storage: assistant rows keep tool_calls = {calls, raw} (raw = provider parts incl. thought signatures,
 * sent back unchanged); tool rows keep tool_calls = {results}. A card's proposal points at its assistant row.
 */
import { prepareMovement } from "@/lib/accounts";
import { moneyNotInSource } from "@/lib/accounts-guard";
import { formatDmy, normalizeDigits, parseDmy, todayIso } from "@/lib/dates";
import type { Json } from "@/lib/db/types";
import { caseLabel, DOC_TYPE } from "@/lib/labels";
import { getLlm, LlmUnavailableError, SpendCapError, type ChatRequest, type LlmMessage, type LlmToolCall } from "@/lib/llm";
import { UNAVAILABLE_TEXT } from "@/lib/llm/unavailable";
import { DEFAULT_TITLE, titleFrom } from "@/lib/threads";
import { createProposal, normalizeForMatch, type DraftOp, type OpHint, type Proposal, type ResolvedFrom } from "@/lib/proposals";
import { draftFromCall, recentLawyerTexts } from "@/lib/library/make";
import { findSpan } from "@/lib/quote-match";
import { cairoDateOf, resolveRelativeDays, type RelativeDay } from "@/lib/relative-days";
import type { Db } from "@/lib/supabase/server";
import { isReadTool, READ_TOOL_SPECS, runReadTool } from "@/lib/tools/read";
import { prepareEdit } from "@/lib/draft/edit";
import type { DraftBody } from "@/lib/library/types";
import { isInternalTool, isWriteTool, OP_TITLE, WRITE_TOOL_ARGS, writeToolSpecs, type WriteArgs } from "@/lib/tools/registry";
import { askContextBlock, type AskItem } from "./ask";
import type { ChatMode } from "./modes";
import { buildSystemPrompt, type CaseContext, type ClientContext } from "./prompt";
import { SourceLog, type SourceItem } from "./sources";
import { CARD_STEP, readStepLabel } from "./step-labels";

const MAX_ROUNDS = 6;
const HISTORY = 40;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Write-tool args that hold a reference (uuid or «@ref»); other string args are free text and may start with "@". */
const REF_KEYS = ["case", "client", "hearing", "document", "previous_stage_case", "template"];
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
  /** the papers this turn really used («استخدمت:»); also saved on the answer's row */
  sources: SourceItem[];
}

/** Thrown by runAssistantTurn; `userMessageSaved` tells the UI whether the lawyer's text is already in the thread. */
export class TurnError extends Error {
  constructor(message: string, readonly userMessageSaved: boolean) {
    super(message);
  }
}

/** `mode`: the composer's mode tab for this message (ask / rulings / draft / analyze); it only changes one line of the system prompt. */
/** `context`: the items the lawyer attached with «اسأل Clausia» (already cleaned by `cleanAsk`); sent to the model as marked data for this turn only. */
type TurnInput = { threadId: string; userText: string; userId: string; officeId: string; mode?: ChatMode; context?: AskItem[] };

/** A whole chat turn — every model and tool call in it — gets 2 minutes (owner decision 2026-10-21). */
export const TURN_LIMIT_MS = 120_000;

/** The turn's time limit passed between model calls (no call in flight). Handled like any «not available now». */
export class TurnTimeLimitError extends LlmUnavailableError {
  constructor(limitMs: number) {
    super(`chat turn time limit (${limitMs}ms) passed`);
    this.name = "TurnTimeLimitError";
  }
}

/** The turn's clock: `signal` aborts when the limit passes (it cancels the model call in flight). */
interface Clock { signal: AbortSignal; deadline: number; limitMs: number }

/**
 * `opts.turnLimitMs`: the whole turn's limit (default TURN_LIMIT_MS; tests pass a short one).
 * `opts.onStep`: called with the words of each REAL step as it starts (a read tool call, a card being prepared): the live steps.
 */
export async function runAssistantTurn(db: Db, input: TurnInput, opts: { turnLimitMs?: number; onStep?: (label: string) => void } = {}): Promise<TurnResult> {
  const state = { saved: false };
  const limitMs = opts.turnLimitMs ?? TURN_LIMIT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), limitMs);
  try {
    return await turn(db, input, state, { signal: ctrl.signal, deadline: Date.now() + limitMs, limitMs }, opts.onStep);
  } catch (e) {
    throw new TurnError(e instanceof Error ? e.message : String(e), state.saved);
  } finally {
    clearTimeout(timer);
  }
}

/** Waits for `work` (a read tool) but not past the turn's limit. */
function withinTurn<T>(work: Promise<T>, clock: Clock): Promise<T> {
  if (clock.signal.aborted) return Promise.reject(new TurnTimeLimitError(clock.limitMs));
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(new TurnTimeLimitError(clock.limitMs));
    clock.signal.addEventListener("abort", stop, { once: true });
    work.then(resolve, reject).finally(() => clock.signal.removeEventListener("abort", stop));
  });
}

async function turn(db: Db, input: TurnInput, state: { saved: boolean }, clock: Clock, onStep?: (label: string) => void): Promise<TurnResult> {
  const text = input.userText.trim();
  if (!text) throw new Error("الرسالة فارغة");
  const { data: thread, error: te } = await db.from("chat_threads").select("id, case_id, client_id, hearing_id, title").eq("id", input.threadId).single();
  if (te || !thread) throw new Error("المحادثة غير موجودة");

  const { data: userMsg, error: ue } = await db.from("chat_messages").insert({ thread_id: thread.id, role: "user", content: text }).select("id, created_at").single();
  if (ue || !userMsg) throw new Error(ue?.message ?? "تعذّر حفظ الرسالة");
  state.saved = true;
  // the session's title: the lawyer's first message, cut to about 40 characters (a session made by an upload keeps its file name)
  await db.from("chat_threads").update({ updated_at: new Date().toISOString(), ...(!thread.title || thread.title === DEFAULT_TITLE ? { title: titleFrom(text) } : {}) }).eq("id", thread.id);

  const sources = new SourceLog();
  const [history, caseContext, clientContext, cardNotes, docs, { texts: sourceTexts, lawyer }, docPages] = await Promise.all([
    loadHistory(db, thread.id),
    thread.case_id ? loadCaseContext(db, thread.case_id) : Promise.resolve(null),
    thread.client_id ? loadClientContext(db, thread.client_id) : Promise.resolve(null),
    loadCardNotes(db, thread.id),
    db.from("documents").select("id, file_name, page_count, read_status, doc_type").eq("thread_id", thread.id).order("created_at").then((r) => r.data ?? []),
    loadSourceTexts(db, thread.id),
    loadDocPages(db, thread.id),
    addChipSources(db, input.context ?? [], sources),
  ]);

  // relative days («بكرة»، «الخميس الجاي») in the lawyer's own messages, each from its own time in Cairo — worked
  // out here, never by the model, never from a paper. This message first, then older ones (newest first).
  const relativeDays = {
    current: resolveRelativeDays(text, userMsg.created_at),
    earlier: lawyer.filter((m) => m.id !== userMsg.id).reverse()
      .map((m) => ({ date: cairoDateOf(m.created_at), days: resolveRelativeDays(m.content, m.created_at) }))
      .filter((e) => e.days.length),
  };
  const resolved = [...relativeDays.current, ...relativeDays.earlier.flatMap((e) => e.days)];

  const hearing = thread.hearing_id ? (await db.from("hearings").select("id, hearing_date").eq("id", thread.hearing_id).maybeSingle()).data : null;
  const system = buildSystemPrompt({ caseContext, clientContext, cardNotes, documents: docs, relativeDays, mode: input.mode, hearing: hearing ? { id: hearing.id, date: formatDmy(hearing.hearing_date) } : null });
  const tools = [...READ_TOOL_SPECS, ...writeToolSpecs()];
  const messages: LlmMessage[] = history;
  // the chips: a data block after the lawyer's text in what the model sees; it is not in the saved message (so it is never read as
  // something the lawyer said: no quote check, no relative day, no session title from it)
  const ask = askContextBlock(input.context ?? [], thread.case_id);
  const lastTurn = messages[messages.length - 1];
  if (ask && lastTurn?.role === "user") lastTurn.text = `${lastTurn.text}\n\n${ask}`;
  const meta = { purpose: "chat" as const, officeId: input.officeId, userId: input.userId, threadId: thread.id };
  const out: TurnResult = { userMessageId: userMsg.id, assistantMessageIds: [], proposalIds: [], text: "", rounds: 0, sources: [] };
  let lastTextId: string | null = null; // the last assistant row with words in it: the «استخدمت:» footer goes under it

  /** The model call for this turn: under the turn's limit, and never more than the provider's own 60s per call. */
  const chat = (req: Omit<ChatRequest, "signal" | "timeoutMs">) => {
    if (clock.signal.aborted) return Promise.reject(new TurnTimeLimitError(clock.limitMs));
    return getLlm().chat({ ...req, signal: clock.signal, timeoutMs: clock.deadline - Date.now() });
  };

  /** The turn ends early: the model failed, or the turn's time limit passed. */
  const cutShort = async (e: unknown): Promise<TurnResult> => {
    // a model call that failed is already logged once in llm_calls (getLlm); one notice in the chat, no retry.
    // The time limit passing with no call in flight has no llm_calls row (no call was made): it is logged here.
    const msg = e instanceof Error ? e.message : String(e);
    if (clock.signal.aborted) console.warn(`[turn] ${thread.id}: the ${clock.limitMs}ms turn limit passed (${msg})`);
    // a turn cut short leaves nothing half-done: drop this turn's cards (nothing in them is saved — they wait for
    // the tap) and its partial replies, so the thread shows the lawyer's message and the notice only
    if (out.proposalIds.length) await db.from("proposals").delete().in("id", out.proposalIds).eq("status", "pending");
    if (out.assistantMessageIds.length) await db.from("chat_messages").delete().eq("thread_id", thread.id).in("role", ["assistant", "tool"]).gt("created_at", userMsg.created_at);
    out.proposalIds = [];
    out.assistantMessageIds = [];
    // only "not available now" (402 / 429 / 5xx / timeout / network / the turn's limit) gets the notice; any other error
    // (a bad request, a blocked reply) is a fault to fix, so it keeps a plain message and its reason in llm_calls
    const friendly = e instanceof SpendCapError ? "مش هقدر أرد دلوقتي: وصلنا لحد الصرف التجريبي."
      : e instanceof LlmUnavailableError ? UNAVAILABLE_TEXT
      : "حصلت مشكلة وأنا بجهّز الرد. جرّب تكتبها تاني بشكل مختلف.";
    const { data: m } = await db.from("chat_messages").insert({ thread_id: thread.id, role: "assistant", content: friendly }).select("id").single();
    if (m) out.assistantMessageIds.push(m.id);
    out.text = friendly;
    out.error = msg;
    return out;
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let res;
    try {
      res = await chat({ system, messages, tools, meta });
    } catch (e) {
      return cutShort(e);
    }
    out.rounds = round + 1;
    const calls = res.toolCalls;
    const stored: StoredAssistant | null = calls.length ? { calls, raw: res.raw } : null;
    const { data: am, error: ae } = await db.from("chat_messages")
      .insert({ thread_id: thread.id, role: "assistant", content: res.text ?? "", tool_calls: stored as unknown as Json })
      .select("id").single();
    if (ae || !am) throw new Error(ae?.message ?? "تعذّر حفظ رد Clausia");
    out.assistantMessageIds.push(am.id);
    if (res.text?.trim()) lastTextId = am.id;
    if (res.text) out.text = out.text ? `${out.text}\n${res.text}` : res.text;
    messages.push({ role: "assistant", text: res.text ?? "", toolCalls: calls, raw: res.raw });
    if (!calls.length) break;

    const results = new Map<string, unknown>();
    const drafts: { call: LlmToolCall; op: DraftOp }[] = [];
    const refsInCard = new Set<string>();
    const editedDrafts = new Map<string, DraftBody>(); // a draft as it stands after the changes already proposed in this card

    for (const call of calls) {
      if (isReadTool(call.name)) {
        // a live step for a read that really runs («بقرا الصحيفة ص 2…»); a paper is named by its type, else by its file name
        const label = readStepLabel(call.name, call.args, call.name === "get_document_text" ? await documentName(db, call.args.document_id, docs) : null);
        if (label) onStep?.(label);
        try {
          const result = await withinTurn(runReadTool(db, call.name, call.args), clock);
          results.set(call.id, result);
          if (call.name === "get_document_text") logPagesRead(sources, result);
        } catch (e) {
          if (e instanceof TurnTimeLimitError) return cutShort(e);
          results.set(call.id, { error: e instanceof Error ? e.message : String(e) });
        }
        continue;
      }
      if (!isWriteTool(call.name) || isInternalTool(call.name)) { // the document-column tools are made by code only
        results.set(call.id, { error: `أداة غير معروفة: ${call.name}` });
        continue;
      }
      // an amount sent as a JSON number is read through its text («3000» stays 3000; it is never a float on its way to the database)
      if (typeof call.args.amount === "number") call.args = { ...call.args, amount: String(call.args.amount) };
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
      // (a date equal to one worked out from the lawyer's «بكرة» / «الخميس الجاي» counts as said)
      const unsupported = notInSource(call.args, [text, ...sourceTexts], resolved);
      if (unsupported.length) {
        results.set(call.id, { error: `لم يُقترح: ${unsupported.join("؛ ")}. اسأل المحامي سؤال واحد قصير ومتخمّنش.` });
        continue;
      }
      // money: the amount and the payment method must be in the lawyer's words (a number in words is not found: the assistant asks)
      const moneyMissing = moneyNotInSource(call.name, call.args, [text, ...sourceTexts]);
      if (moneyMissing.length) {
        results.set(call.id, { error: `لم يُقترح: ${moneyMissing.join("؛ ")}. اسأل المحامي سؤال واحد قصير ومتخمّنش.` });
        continue;
      }
      // a movement's case is decided by code (named / suggested / ask); a missing date becomes today
      let args = call.args;
      let hint: OpHint | undefined;
      if (call.name === "record_movement") {
        const prep = await prepareMovement(db, call.args, [text, ...sourceTexts]).catch((e) => ({ ok: false as const, error: `لم يُقترح: ${e instanceof Error ? e.message : String(e)}` }));
        if (!prep.ok) { results.set(call.id, { error: prep.error }); continue; }
        args = prep.args;
        hint = prep.hint;
      }
      // a draft: the CODE fills the template from the case file (the model only picked the template and the case); the grounds / requests
      // are accepted only when the lawyer asked for them in his own words (this message and the two before it), and carry no number of the model's own
      // the lawyer's own words that count for a grounds / a change: this message and the two before it, but only in a case's session (a general session mixes cases: #202)
      const askedIn = thread.case_id ? recentLawyerTexts(text, userMsg.id, lawyer) : [text];
      let draft: DraftOp["draft"];
      if (call.name === "create_draft") {
        const prep = await draftFromCall(db, call.args, askedIn);
        if (!prep.ok) { results.set(call.id, { error: prep.error }); continue; }
        draft = prep.draft;
      }
      // a change to a saved draft (PR 7b): checked against the draft as it stands after the earlier changes of THIS card; a locked span, words that are not
      // there, a citation not on the paper's page, an article or number nobody gave: refused here and the model is told why. Nothing is saved before the tap.
      let edit: DraftOp["edit"];
      if (call.name === "edit_draft") {
        const a = parsed.data as WriteArgs<"edit_draft">;
        const prep = await prepareEdit(db, a, askedIn, thread.case_id, editedDrafts.get(a.draft));
        if (!prep.ok) { results.set(call.id, { error: prep.error }); continue; }
        editedDrafts.set(a.draft, prep.body);
        edit = prep.edit;
      }
      const ref = call.args.ref;
      if (typeof ref === "string" && ref) refsInCard.add(ref);
      drafts.push({
        call,
        op: {
          ...(hint ? { hint } : {}),
          ...(draft ? { draft } : {}),
          ...(edit ? { edit } : {}),
          tool: call.name, args, source: sourceOf((call.args.quote as string | undefined) ?? null, text, userMsg.id, docPages),
          resolved_from: fromRelativeWords(call.args, [text, ...sourceTexts], resolved),
        },
      });
    }

    if (drafts.length) {
      const caseId = thread.case_id ?? firstCaseUuid(drafts.map((x) => x.op)) ?? drafts.find((x) => x.op.edit)?.op.edit?.case ?? null;
      onStep?.(CARD_STEP);
      try {
        const proposal: Proposal = await createProposal(db, { threadId: thread.id, messageId: am.id, caseId, ops: drafts.map((x) => x.op), sourceTexts: [...sourceTexts, text] });
        out.proposalIds.push(proposal.id);
        for (const o of proposal.ops) if (o.source.kind === "document") sources.addCited(o.source.document_id ?? "", o.source.page, o.source.quote, o.source.char_start, o.source.char_end);
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
        const r = await chat({ system: `${system}\n\nاكتب دلوقتي رد قصير للمحامي بالعامية المصرية: لقيت إيه ومحتاج منه إيه، من غير ما تستدعي أدوات.`, messages: [...messages, { role: "user", text: "لخّص لي اللي وصلتله وقولّي محتاج مني إيه." }], meta });
        reply = r.text?.trim() ?? "";
      } catch (e) {
        // not available now, or the turn's limit passed: the same single notice and cleanup as any other round
        if (e instanceof LlmUnavailableError) return cutShort(e);
      }
      if (!reply) reply = "راجعت اللي عندي ولسه محتاج خطوة كمان. اكتب «كمّل» وأنا أجهّز البطاقة.";
    }
    const { data: m } = await db.from("chat_messages").insert({ thread_id: thread.id, role: "assistant", content: reply }).select("id").single();
    if (m) { out.assistantMessageIds.push(m.id); lastTextId = m.id; }
    out.text = reply;
  }

  // «استخدمت:» — the papers this turn really used, saved with the answer so the footer survives a reload (none used: no footer)
  out.sources = sources.items();
  if (out.sources.length && lastTextId) {
    const { error } = await db.from("chat_messages").update({ sources: out.sources as unknown as Json }).eq("id", lastTextId);
    if (error) console.warn(`[turn] ${thread.id}: the sources footer was not saved (${error.message})`);
  }
  return out;
}

/** The paper's name for a live step: its type («صحيفة دعوى») when known, else its file name. Null when it can not be told. */
async function documentName(db: Db, id: unknown, threadDocs: { id: string; file_name: string; doc_type?: string | null }[]): Promise<string | null> {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  let d: { file_name: string; doc_type?: string | null } | null | undefined = threadDocs.find((x) => x.id === id);
  if (!d) d = await db.from("documents").select("file_name, doc_type").eq("id", id).maybeSingle().then((r) => r.data, () => null);
  if (!d) return null;
  return d.doc_type && d.doc_type !== "other" && d.doc_type in DOC_TYPE ? DOC_TYPE[d.doc_type as keyof typeof DOC_TYPE] : d.file_name;
}

/** The pages a get_document_text call really returned (not the ones it was asked for). */
function logPagesRead(log: SourceLog, result: unknown) {
  const r = result as { document?: { id?: unknown }; pages?: { page_no?: unknown }[] } | null;
  const id = r?.document?.id;
  if (typeof id !== "string" || !Array.isArray(r?.pages)) return;
  log.addRead(id, r.pages.map((p) => Number(p.page_no)));
}

/** The rows a context chip points at that have a paper source (the row's own page, quote and span). A chip with none came from the lawyer's words: no source. */
const CHIP_TABLE = { fact: "case_facts", party: "case_parties", request: "case_requests", argument: "case_arguments", hearing: "hearings" } as const;
async function addChipSources(db: Db, items: AskItem[], log: SourceLog): Promise<void> {
  await Promise.all(items.map(async (i) => {
    if (!(i.kind in CHIP_TABLE)) return;
    const table = CHIP_TABLE[i.kind as keyof typeof CHIP_TABLE];
    const { data } = await db.from(table).select("source_document_id, source_page, source_quote, source_char_start, source_char_end").eq("id", i.id).maybeSingle();
    if (data?.source_document_id) log.addCited(data.source_document_id, data.source_page, data.source_quote, data.source_char_start, data.source_char_end);
  }));
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
    if (hit) {
      const s = findSpan(hit.text, quote); // by code, on the page that matched; the model is not asked
      return { kind: "document", document_id: hit.document_id, page: hit.page_no, quote, char_start: s?.start ?? null, char_end: s?.end ?? null };
    }
  }
  return { kind: "chat", message_id: messageId, quote };
}

function firstCaseUuid(ops: DraftOp[]): string | null {
  for (const o of ops) {
    if (o.tool === "record_movement" || o.tool === "set_case_fee") continue; // money cards belong to the client's chat, not to a case's
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

async function loadClientContext(db: Db, clientId: string): Promise<ClientContext | null> {
  const { data: c } = await db.from("clients").select("id, name, phone").eq("id", clientId).maybeSingle();
  if (!c) return null;
  const { data: cases } = await db.from("cases").select("id, case_number, case_year, title, status").eq("client_id", clientId).neq("review_status", "rejected").order("created_at", { ascending: false }).limit(30);
  return { id: c.id, name: c.name, phone: c.phone, cases: (cases ?? []).map((x) => ({ id: x.id, label: caseLabel(x), status: x.status })) };
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
      const what = [a.name, a.amount && `${a.amount} ج.م`, a.case_number && `رقم ${a.case_number}${a.case_year ? ` لسنة ${a.case_year}` : ""}`, a.date, a.next_date && `القادمة ${a.next_date}`, typeof a.text === "string" ? a.text.slice(0, 40) : null]
        .filter(Boolean).join(" ");
      const ids = o.result_id ? ` (id = ${o.result_id}${next.has(o.result_id) ? `، الجلسة القادمة id = ${next.get(o.result_id)}` : ""})` : "";
      return `${o.op_id} ${o.tool} [${OP_TITLE[o.tool] ?? o.tool}${what ? `: ${what}` : ""}] → ${STATUS_NOTE[o.status] ?? o.status}${ids}${o.error ? ` — ${o.error}` : ""}`;
    });
    return `- بطاقة ${i + 1}: ${ops.join("؛ ")}`;
  });
}

/**
 * Texts the quotes may come from: every lawyer message in the thread + pages of documents uploaded here.
 * `lawyer` = the lawyer's messages alone, oldest first (their relative days are resolved; a paper's never are).
 */
async function loadSourceTexts(db: Db, threadId: string): Promise<{ texts: string[]; lawyer: { id: string; content: string; created_at: string }[] }> {
  const [{ data: msgs }, { data: docs }] = await Promise.all([
    db.from("chat_messages").select("id, content, created_at, attachments").eq("thread_id", threadId).eq("role", "user").order("created_at"),
    db.from("documents").select("id").eq("thread_id", threadId),
  ]);
  const rows = msgs ?? [];
  const texts = rows.map((m) => m.content);
  // relative days come only from the lawyer's own sentences in the recent window: not from an upload row
  // («أرفقتُ مستندًا: جلسة بكرة.pdf» is a file name), and not from weeks-old messages beyond the history window
  const lawyer = rows
    .filter((m) => !(Array.isArray(m.attachments) && m.attachments.length))
    .slice(-HISTORY)
    .map(({ id, content, created_at }) => ({ id, content, created_at }));
  const ids = (docs ?? []).map((d) => d.id);
  if (ids.length) {
    const { data: pages } = await db.from("document_pages").select("text").in("document_id", ids);
    for (const p of pages ?? []) texts.push(p.text);
  }
  return { texts, lawyer };
}

const DATE_KEYS = ["date", "facts_date", "next_date", "appeal_deadline"] as const;
const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل|ابريل", "مايو", "يونيو", "يوليو", "أغسطس|اغسطس", "سبتمبر", "أكتوبر|اكتوبر", "نوفمبر", "ديسمبر"];

/** The resolved relative day a proposed full date equals, per date arg (next_date → «بكرة» = 22/10/2026). */
export function resolvedDatesOf(args: Record<string, unknown>, resolved: RelativeDay[]): Record<string, ResolvedFrom> {
  const out: Record<string, ResolvedFrom> = {};
  for (const k of DATE_KEYS) {
    const v = args[k];
    const p = typeof v === "string" ? parseDmy(v) : null;
    const hit = p?.precision === "day" ? resolved.find((r) => r.iso === p.iso) : undefined;
    if (hit) out[k] = { word: hit.word, iso: hit.iso, label: hit.label };
  }
  return out;
}

/**
 * The card's «بكرة = الخميس 22/10/2026» notes: date args whose value is not written in the texts but equals a day
 * resolved from the lawyer's words. A date the lawyer also wrote out in full needs no note.
 */
export function fromRelativeWords(args: Record<string, unknown>, texts: string[], resolved: RelativeDay[]): Record<string, ResolvedFrom> {
  return Object.fromEntries(Object.entries(resolvedDatesOf(args, resolved)).filter(([k]) => notInSource({ [k]: args[k] }, texts).length > 0));
}

/**
 * Which proposed values are not backed by the source texts (lawyer's messages + attached papers).
 * `resolved`: relative days worked out by code from the LAWYER's words (never a paper's); a full date equal to
 * one of them counts as stated.
 */
export function notInSource(args: Record<string, unknown>, texts: string[], resolved: RelativeDay[] = []): string[] {
  const src = normalizeDigits(texts.join("\n"));
  const norm = normalizeForMatch(src);
  const out: string[] = [];
  const fromWords = resolvedDatesOf(args, resolved);
  for (const k of DATE_KEYS) {
    const v = args[k];
    if (typeof v !== "string" || !v.trim()) continue;
    if (fromWords[k]) continue;
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
