// When the model can't answer (402 no credit, 429 rate limit, 5xx, network): the chat gets ONE notice
// «Clausia مش متاحة دلوقتي، جرّب كمان شوية», the request is sent once (no retry), and llm_calls gets one failed row.
// Gemini is faked (global fetch), so this costs nothing.
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-llm-unavailable.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { Db } from "@/lib/supabase/server";
import { runAssistantTurn } from "@/lib/assistant/turn";
import { UNAVAILABLE_TEXT } from "@/lib/llm/unavailable";
import { createGeneralThread } from "@/lib/threads";

let fails = 0;
const check = (ok: boolean, what: string, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? `  (${extra})` : ""}`); if (!ok) fails++; };

const realFetch = globalThis.fetch;
let geminiCalls = 0;
function fake(mode: number | "network") {
  geminiCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.includes("generativelanguage.googleapis.com")) return realFetch(input, init);
    geminiCalls++;
    if (mode === "network") throw new TypeError("fetch failed");
    return new Response(JSON.stringify({ error: { message: `fake ${mode}` } }), { status: mode, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

async function main() {
  const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data: auth, error } = await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
  if (error) throw error;
  const db = sb as unknown as Db;
  const { data: m } = await db.from("office_members").select("office_id").eq("user_id", auth.user.id).single();
  const ctx = { userId: auth.user.id, officeId: m!.office_id };

  for (const mode of [402, 429, 503, "network"] as const) {
    const thread = await createGeneralThread(db, `اختبار عدم التوفر ${mode}`);
    try {
      fake(mode);
      const started = Date.now();
      const r = await runAssistantTurn(db, { threadId: thread, userText: "قرار جلسة النهارده إيه؟", ...ctx });
      globalThis.fetch = realFetch;
      check(r.text === UNAVAILABLE_TEXT, `${mode}: the chat says «${UNAVAILABLE_TEXT}»`, r.text);
      check(geminiCalls === 1, `${mode}: one request, no retry`, `${geminiCalls}`);
      check(Date.now() - started < 10_000, `${mode}: no hang`, `${Date.now() - started}ms`);
      const { data: msgs } = await db.from("chat_messages").select("role, content").eq("thread_id", thread).eq("role", "assistant");
      check(msgs?.length === 1 && msgs[0].content === UNAVAILABLE_TEXT, `${mode}: one notice in the thread`, `${msgs?.length}`);
      const { data: logs } = await db.from("llm_calls").select("ok").eq("thread_id", thread);
      check(logs?.length === 1 && logs[0].ok === false, `${mode}: logged once`, `${logs?.length}`);
    } finally {
      globalThis.fetch = realFetch;
      await db.from("chat_threads").delete().eq("id", thread);
    }
  }
  console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks passed");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
