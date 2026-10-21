// Relative days through a whole chat turn (Gemini faked with a global fetch patch, so this costs nothing):
// 1) the days resolved from the lawyer's message reach the model request as data
// 2) a proposal that uses a resolved date is accepted and its op carries «بكرة = …» / «امبارح = …» for the card
// 3) the lawyer's edit of that date drops the note
// 4) a guessed date (no word for it) is still refused
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-relative-days-turn.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { Db } from "@/lib/supabase/server";
import { PROPOSED_RESULT, runAssistantTurn } from "@/lib/assistant/turn";
import { formatDayLabel, formatDmy, todayIso } from "@/lib/dates";
import { decideProposal, getProposal } from "@/lib/proposals";
import { createGeneralThread } from "@/lib/threads";

let fails = 0;
const check = (ok: boolean, what: string, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? `  (${extra})` : ""}`); if (!ok) fails++; };
const NAME1 = "مروان الاختباري للأيام";
const NAME2 = "هالة الاختبارية للأيام";

type Body = { systemInstruction?: { parts: { text: string }[] }; contents: { role: string; parts: Record<string, unknown>[] }[] };
const realFetch = globalThis.fetch;
const reply = (parts: Record<string, unknown>[]) => new Response(JSON.stringify({
  candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
}), { status: 200, headers: { "content-type": "application/json" } });

/** Fake Gemini: round 1 = the given tool calls, round 2 = a short text. Keeps every request body. */
function fake(calls: () => { name: string; args: Record<string, unknown> }[]) {
  const bodies: Body[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.includes("generativelanguage.googleapis.com")) return realFetch(input, init);
    bodies.push(JSON.parse(String(init?.body)) as Body);
    if (bodies.length === 1) return reply(calls().map((c) => ({ functionCall: c })));
    return reply([{ text: "جهّزت البطاقة، راجعها." }]);
  }) as typeof fetch;
  return bodies;
}
/** the functionResponse results the model got back in round 2, by tool name */
function results(b: Body | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of b?.contents ?? []) for (const p of c.parts) {
    const fr = p.functionResponse as { name: string; response: { result: unknown } } | undefined;
    if (fr) out[fr.name] = JSON.stringify(fr.response.result);
  }
  return out;
}

async function main() {
  const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data: auth, error } = await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
  if (error) throw error;
  const db = sb as unknown as Db;
  const { data: m } = await db.from("office_members").select("office_id").eq("user_id", auth.user.id).single();
  const ctx = { userId: auth.user.id, officeId: m!.office_id };
  const threads: string[] = [];

  try {
    // 1–3) «امبارح» + «بكرة» in the lawyer's words
    const t1 = await createGeneralThread(db, "اختبار الأيام النسبية");
    threads.push(t1);
    // the message is saved just before the model is called, so «today» at call time is the message's Cairo day
    const yesterday = () => formatDmy(todayIso(-1));
    const tomorrow = () => formatDmy(todayIso(1));
    const bodies = fake(() => [
      { name: "create_client", args: { ref: "c1", name: NAME1, kind: "person", quote: NAME1 } },
      { name: "create_case", args: { ref: "k1", client: "@c1", title: "دعوى عمالية", case_type: "عمال", client_role: "plaintiff", facts_date: yesterday(), quote: "اتفصل من الشغل امبارح" } },
      { name: "add_hearing", args: { case: "@k1", date: tomorrow(), quote: "والجلسة الأولى بكرة" } },
    ]);
    const r1 = await runAssistantTurn(db, { threadId: t1, userText: `موكل جديد اسمه ${NAME1}، اتفصل من الشغل امبارح، رفعنا له دعوى عمالية، والجلسة الأولى بكرة.`, ...ctx });
    globalThis.fetch = realFetch;
    const { data: um } = await db.from("chat_messages").select("created_at").eq("thread_id", t1).eq("role", "user").single();
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(um!.created_at));
    const [y, mo, d] = day.split("-").map(Number);
    const iso = (n: number) => { const x = new Date(Date.UTC(y, mo - 1, d + n)); return x.toISOString().slice(0, 10); };
    const sys = bodies[0]?.systemInstruction?.parts[0]?.text ?? "";
    const want = `في رسالة المحامي: "امبارح" = ${formatDayLabel(iso(-1))}، "بكرة" = ${formatDayLabel(iso(1))}`;
    check(sys.includes(want), "the resolved line reaches the model request", want);
    check(sys.includes("متحسبش أي تاريخ بنفسك"), "the prompt tells the model never to compute a date");
    const res1 = results(bodies[1]);
    check((res1.create_case ?? "").includes(PROPOSED_RESULT), "a create_case with the resolved date is accepted", res1.create_case?.slice(0, 90));
    check(r1.proposalIds.length === 1, "one card", `${r1.proposalIds.length}`);
    const p1 = r1.proposalIds[0] ? await getProposal(db, r1.proposalIds[0]) : null;
    const op = p1?.ops.find((o) => o.tool === "create_case");
    const note = op?.resolved_from?.facts_date;
    check(note?.word === "امبارح" && note.iso === iso(-1) && note.label === formatDayLabel(iso(-1)), "the op carries «امبارح = <date>» for facts_date", note ? `${note.word} = ${note.label}` : "none");
    const hop = p1?.ops.find((o) => o.tool === "add_hearing");
    const hnote = hop?.resolved_from?.date;
    check(hnote ? `${hnote.word} = ${hnote.label}` === `بكرة = ${formatDayLabel(iso(1))}` : false, "the hearing op carries «بكرة = <date>»", hnote ? `${hnote.word} = ${hnote.label}` : "none");
    check(!p1?.ops.find((o) => o.tool === "create_client")?.resolved_from, "an op with no date has no note");

    // 3) the lawyer edits that date: the note goes
    if (p1 && op) {
      const edited = formatDmy(iso(-5));
      // facts_date edited, the hearing date kept as proposed (an edit that leaves the value as it was is no change)
      const after = await decideProposal(db, p1.id, { mode: "confirm", edits: { [op.op_id]: { facts_date: edited }, ...(hop ? { [hop.op_id]: { date: hop.args.date } } : {}) } });
      const eop = after.ops.find((o) => o.op_id === op.op_id);
      check(eop?.status === "confirmed" && eop.args.facts_date === edited, "the edited date is saved", `${eop?.status} ${String(eop?.args.facts_date)}`);
      check(!eop?.resolved_from, "the edit dropped the «امبارح» note");
      check(after.ops.find((o) => o.op_id === hop?.op_id)?.resolved_from?.date?.word === "بكرة", "an unchanged date keeps its «بكرة» note");
    }

    // 4) a date with no word for it is still refused
    const t2 = await createGeneralThread(db, "اختبار تاريخ متخمّن");
    threads.push(t2);
    const bodies2 = fake(() => [
      { name: "create_client", args: { ref: "c1", name: NAME2, kind: "person", quote: NAME2 } },
      { name: "create_case", args: { ref: "k1", client: "@c1", title: "دعوى عمالية", facts_date: formatDmy(todayIso(-3)), quote: "اتفصلت من كام يوم" } },
    ]);
    const r2 = await runAssistantTurn(db, { threadId: t2, userText: `موكلة جديدة اسمها ${NAME2}، اتفصلت من كام يوم.`, ...ctx });
    globalThis.fetch = realFetch;
    const res2 = results(bodies2[1]);
    check((res2.create_case ?? "").includes("لم يُقترح"), "a guessed date is refused and the model is told to ask", res2.create_case?.slice(0, 90));
    check(!(bodies2[0]?.systemInstruction?.parts[0]?.text ?? "").includes("في رسالة المحامي:"), "no resolved line when the lawyer said no relative day");
    const p2 = r2.proposalIds[0] ? await getProposal(db, r2.proposalIds[0]) : null;
    check(!p2?.ops.some((o) => o.tool === "create_case"), "the card has no case with the guessed date", p2?.ops.map((o) => o.tool).join(","));
  } finally {
    globalThis.fetch = realFetch;
    const { data: cl } = await db.from("clients").select("id").in("name", [NAME1, NAME2]);
    const ids = (cl ?? []).map((x) => x.id);
    if (ids.length) {
      const { data: cs } = await db.from("cases").select("id").in("client_id", ids);
      const caseIds = (cs ?? []).map((x) => x.id);
      if (caseIds.length) {
        await db.from("chat_threads").delete().in("case_id", caseIds);
        await db.from("cases").delete().in("id", caseIds);
      }
      await db.from("clients").delete().in("id", ids);
    }
    for (const t of threads) {
      await db.from("proposals").delete().eq("thread_id", t);
      await db.from("chat_threads").delete().eq("id", t);
    }
  }
  console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks passed");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
