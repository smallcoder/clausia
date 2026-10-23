// GET /api/chat/steps?turn=<uuid>&after=<seq> → the steps of a running chat turn after `after`, in order. The browser makes the turn
// id when it sends a message and polls this while the send action runs. A route, not a server action: a page's server actions run
// one at a time, so a steps action would wait behind the turn itself. RLS client: only the lawyer's own office is readable.
import { createClient } from "@/lib/supabase/server";

export type TurnSteps = { steps: { seq: number; label: string }[] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const turn = q.get("turn") ?? "";
  const after = Number(q.get("after") ?? 0);
  if (!UUID.test(turn) || !Number.isInteger(after) || after < 0) return Response.json({ error: "bad request" }, { status: 400 });
  const { data } = await db.from("chat_turn_steps").select("seq, label").eq("turn_id", turn).gt("seq", after).order("seq").limit(50);
  return Response.json({ steps: data ?? [] } satisfies TurnSteps, { headers: { "cache-control": "no-store" } });
}
