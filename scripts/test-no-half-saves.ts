// A failure never leaves a half-saved card or an empty thread (owner decision 2026-10-21). Free (Gemini faked).
// 1) confirming a card where a later op fails saves nothing (earlier ops are undone) and the card stays as it was
// 2) a model failure in the 2nd round of a turn drops that turn's card and partial replies: message + notice only
// 3) dropIfEmpty removes an empty new thread, never one with messages or a case's thread
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-no-half-saves.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { Db } from "@/lib/supabase/server";
import { runAssistantTurn } from "@/lib/assistant/turn";
import { UNAVAILABLE_TEXT } from "@/lib/llm/unavailable";
import { createProposal, decideProposal, getProposal } from "@/lib/proposals";
import { createGeneralThread, dropIfEmpty } from "@/lib/threads";

let fails = 0;
const check = (ok: boolean, what: string, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? `  (${extra})` : ""}`); if (!ok) fails++; };
const NAME = "سامح الاختباري للتراجع";

async function main() {
  const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data: auth, error } = await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
  if (error) throw error;
  const db = sb as unknown as Db;
  const { data: m } = await db.from("office_members").select("office_id").eq("user_id", auth.user.id).single();
  const ctx = { userId: auth.user.id, officeId: m!.office_id };
  const clients = async () => (await db.from("clients").select("id", { count: "exact", head: true }).eq("name", NAME)).count ?? 0;
  const cases = async () => (await db.from("cases").select("id", { count: "exact", head: true }).eq("case_number", "9931")).count ?? 0;

  const t1 = await createGeneralThread(db, "اختبار التراجع");
  try {
    // 1) all or nothing
    const src = { kind: "chat" as const, message_id: null, quote: NAME };
    const p = await createProposal(db, {
      threadId: t1, sourceTexts: [`${NAME} 9931`],
      ops: [
        { tool: "create_client", args: { ref: "c", name: NAME, kind: "person", quote: NAME }, source: src },
        { tool: "create_case", args: { ref: "k", client: "@c", case_number: "9931", stage: "first_instance", quote: "9931" }, source: src },
        // a case id that does not exist: the insert fails on the foreign key
        { tool: "add_party", args: { case: "00000000-0000-4000-8000-000000000000", name: "خصم وهمي", role: "defendant", quote: NAME }, source: src },
      ],
    });
    let thrown = "";
    try { await decideProposal(db, p.id, { mode: "confirm" }); } catch (e) { thrown = e instanceof Error ? e.message : String(e); }
    check(thrown.startsWith("ماتحفظش حاجة"), "a failed save says nothing was saved", thrown.slice(0, 80));
    check(await clients() === 0, "the client from the first op was undone");
    check(await cases() === 0, "the case from the second op was undone (and its thread)");
    const after = (await getProposal(db, p.id))!;
    check(after.status === "pending", "the card stays pending", after.status);
    check(after.ops.map((o) => o.status).join(",") === "pending,pending,failed", "ops: pending, pending, failed", after.ops.map((o) => o.status).join(","));
    check(after.ops.every((o) => !o.result_id), "no op keeps a result id");

    // 2) a turn cut short in its second round
    const realFetch = globalThis.fetch;
    let n = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.includes("generativelanguage.googleapis.com")) return realFetch(input, init);
      n++;
      if (n === 1) return new Response(JSON.stringify({
        candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "create_client", args: { name: NAME, kind: "person", quote: NAME } } }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ error: { message: "fake 503" } }), { status: 503, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const t2 = await createGeneralThread(db, "اختبار قطع الدور");
    try {
      const r = await runAssistantTurn(db, { threadId: t2, userText: `موكل جديد اسمه ${NAME}`, ...ctx });
      globalThis.fetch = realFetch;
      check(n === 2, "the model was called twice (card, then failure)", `${n}`);
      check(r.text === UNAVAILABLE_TEXT && r.proposalIds.length === 0, "the turn ends with the notice and no card");
      const { count: cards } = await db.from("proposals").select("id", { count: "exact", head: true }).eq("thread_id", t2);
      check(cards === 0, "the half-done card was dropped", `${cards}`);
      const { data: msgs } = await db.from("chat_messages").select("role, content").eq("thread_id", t2).order("created_at");
      check(msgs?.map((x) => x.role).join(",") === "user,assistant" && msgs?.[1].content === UNAVAILABLE_TEXT, "thread = the lawyer's message + the notice", msgs?.map((x) => x.role).join(","));
    } finally {
      globalThis.fetch = realFetch;
      await db.from("chat_threads").delete().eq("id", t2);
    }

    // 3) empty threads
    const t3 = await createGeneralThread(db, "فاضية");
    check(await dropIfEmpty(db, t3), "an empty new thread is removed");
    const t4 = await createGeneralThread(db, "فيها رسالة");
    await db.from("chat_messages").insert({ thread_id: t4, role: "user", content: "سلام" });
    check(!(await dropIfEmpty(db, t4)), "a thread with a message is kept");
    await db.from("chat_threads").delete().eq("id", t4);
    const { data: caseThread } = await db.from("chat_threads").select("id").not("case_id", "is", null).limit(1).maybeSingle();
    if (caseThread) {
      const { count } = await db.from("chat_messages").select("id", { count: "exact", head: true }).eq("thread_id", caseThread.id);
      if (!count) check(!(await dropIfEmpty(db, caseThread.id)), "a case's own thread is never removed");
    }
  } finally {
    await db.from("proposals").delete().eq("thread_id", t1);
    await db.from("chat_threads").delete().eq("id", t1);
    const { data: cl } = await db.from("clients").select("id").eq("name", NAME);
    if (cl?.length) await db.from("clients").delete().in("id", cl.map((x) => x.id));
  }
  console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks passed");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
