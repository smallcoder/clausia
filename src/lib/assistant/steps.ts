import "server-only";
/**
 * Live steps, server side: records the steps of a running turn in chat_turn_steps (RLS client) so the browser can show them
 * while the turn runs (GET /api/chat/steps). The browser makes the turn id; an id that is not a uuid means "do not record"
 * (never an error). Inserts are chained in order and never break the turn; `finish()` waits for them, then deletes the
 * turn's rows (the table only holds turns that are running now).
 */
import type { Db } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isTurnId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export function stepRecorder(db: Db, turnId: unknown): { onStep?: (label: string) => void; finish: () => Promise<void> } {
  if (!isTurnId(turnId)) return { finish: async () => {} };
  let seq = 0;
  let chain: Promise<unknown> = Promise.resolve();
  return {
    onStep: (label) => {
      const n = ++seq;
      chain = chain.then(() => db.from("chat_turn_steps").insert({ turn_id: turnId, seq: n, label })).then(() => {}, () => {});
    },
    finish: async () => {
      await chain;
      if (seq) await db.from("chat_turn_steps").delete().eq("turn_id", turnId).then(() => {}, () => {});
    },
  };
}
