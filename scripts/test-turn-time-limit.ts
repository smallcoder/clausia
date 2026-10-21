// A whole chat turn has a time limit (2 minutes; owner decision 2026-10-21). When it passes, the turn ends like any
// «not available now»: one notice «Clausia مش متاحة دلوقتي…», no card left behind, and one failed llm_calls row for
// the call it cancelled. Gemini is faked with slow answers and the limit is 3s, so this is free and quick.
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-turn-time-limit.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { Db } from "@/lib/supabase/server";
import { runAssistantTurn, TURN_LIMIT_MS } from "@/lib/assistant/turn";
import { UNAVAILABLE_TEXT } from "@/lib/llm/unavailable";
import { createGeneralThread } from "@/lib/threads";

let fails = 0;
const check = (ok: boolean, what: string, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? `  (${extra})` : ""}`); if (!ok) fails++; };
const LIMIT = 3_000;
const NAME = "نادر الاختباري للوقت";

const realFetch = globalThis.fetch;
const reply = (parts: Record<string, unknown>[]) => new Response(JSON.stringify({
  candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
}), { status: 200, headers: { "content-type": "application/json" } });
/** waits `ms`, or rejects like fetch does when the request is cancelled */
const slow = (ms: number, signal: AbortSignal | null | undefined, then: () => Response) => new Promise<Response>((resolve, reject) => {
  const abort = () => reject(new DOMException("This operation was aborted", "AbortError"));
  if (signal?.aborted) return abort(); // like fetch: an already-cancelled request fails at once
  const t = setTimeout(() => resolve(then()), ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); abort(); }, { once: true });
});

/** Fake Gemini: `steps[n]` answers the n-th call (delay + parts). Returns the counters. */
type Step = { ms: number | (() => number); parts: Record<string, unknown>[] };
function fake(steps: Step[]) {
  const seen = { calls: 0, aborted: 0 };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.includes("generativelanguage.googleapis.com")) return realFetch(input, init);
    const s = steps[Math.min(seen.calls++, steps.length - 1)];
    try {
      return await slow(typeof s.ms === "function" ? s.ms() : s.ms, init?.signal, () => reply(s.parts));
    } catch (e) {
      seen.aborted++;
      throw e;
    }
  }) as typeof fetch;
  return seen;
}

async function main() {
  const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data: auth, error } = await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
  if (error) throw error;
  const db = sb as unknown as Db;
  const { data: m } = await db.from("office_members").select("office_id").eq("user_id", auth.user.id).single();
  const ctx = { userId: auth.user.id, officeId: m!.office_id };
  const threads: string[] = [];
  check(TURN_LIMIT_MS === 120_000, "the default turn limit is 2 minutes", `${TURN_LIMIT_MS}`);

  /** the turn's outcome in the database */
  async function outcome(thread: string) {
    const [{ data: msgs }, { count: cards }, { data: logs }] = await Promise.all([
      db.from("chat_messages").select("role, content").eq("thread_id", thread).order("created_at"),
      db.from("proposals").select("id", { count: "exact", head: true }).eq("thread_id", thread),
      db.from("llm_calls").select("ok, error").eq("thread_id", thread),
    ]);
    return { msgs: msgs ?? [], cards: cards ?? 0, failed: (logs ?? []).filter((l) => !l.ok), ok: (logs ?? []).filter((l) => l.ok).length };
  }

  let turnStarted = 0;
  const cases: { name: string; steps: Step[]; text: string; calls: number; failedRows: number }[] = [
    // 1) the first model call never answers in time
    { name: "a slow first call", steps: [{ ms: 20_000, parts: [{ text: "متأخر" }] }], text: "قرار جلسة النهارده إيه؟", calls: 1, failedRows: 1 },
    // 2) a card in round 1, then a slow round 2: the card must not be left behind
    {
      name: "a card, then a slow second call",
      steps: [
        { ms: 300, parts: [{ functionCall: { name: "create_client", args: { name: NAME, kind: "person", quote: NAME } } }] },
        { ms: 20_000, parts: [{ text: "متأخر" }] },
      ],
      text: `موكل جديد اسمه ${NAME}`, calls: 2, failedRows: 1,
    },
    // 3) the limit passes while Clausia looks things up between calls (no model call in flight, so no llm_calls row)
    {
      name: "the limit passes during a lookup",
      steps: [
        // answers 100ms before the limit (counted from the turn start), so the lookup after it crosses the limit
        { ms: () => Math.max(0, turnStarted + LIMIT - 100 - Date.now()), parts: [{ functionCall: { name: "search_clients", args: { query: NAME } } }] },
        { ms: 300, parts: [{ text: "مش المفروض يوصل هنا" }] },
      ],
      text: `فيه موكل اسمه ${NAME}؟`, calls: 1, failedRows: 0,
    },
  ];

  try {
    for (const c of cases) {
      const thread = await createGeneralThread(db, `اختبار حد الوقت: ${c.name}`);
      threads.push(thread);
      const seen = fake(c.steps);
      const started = Date.now();
      turnStarted = started;
      const r = await runAssistantTurn(db, { threadId: thread, userText: c.text, ...ctx }, { turnLimitMs: LIMIT });
      const elapsed = Date.now() - started;
      globalThis.fetch = realFetch;
      const o = await outcome(thread);
      check(r.text === UNAVAILABLE_TEXT, `${c.name}: the chat says «${UNAVAILABLE_TEXT}»`, r.text.slice(0, 60));
      check(o.msgs.map((x) => x.role).join(",") === "user,assistant" && o.msgs[1]?.content === UNAVAILABLE_TEXT, `${c.name}: thread = the lawyer's message + one notice`, o.msgs.map((x) => x.role).join(","));
      check(o.cards === 0 && r.proposalIds.length === 0, `${c.name}: no card left behind`, `${o.cards}`);
      check(seen.calls === c.calls, `${c.name}: ${c.calls} model call(s), no retry`, `${seen.calls}`);
      check(o.failed.length === c.failedRows, `${c.name}: ${c.failedRows} failed llm_calls row(s)`, o.failed.map((f) => f.error).join(" | ").slice(0, 120));
      if (c.failedRows) check(seen.aborted === 1, `${c.name}: the request in flight was cancelled`, `${seen.aborted}`);
      check(elapsed >= LIMIT - 100 && elapsed < LIMIT + 2_500, `${c.name}: ends at about the limit`, `${elapsed}ms for a ${LIMIT}ms limit`);
    }
  } finally {
    globalThis.fetch = realFetch;
    for (const t of threads) {
      await db.from("proposals").delete().eq("thread_id", t);
      await db.from("chat_threads").delete().eq("id", t);
    }
  }
  console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks passed");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
