import "server-only";
// The chat panel's server side, shared by the two pages of the layout's @chat slot (Home "/" and every deeper path).
import { createClient, getSession } from "@/lib/supabase/server";
import { ChatPanel } from "./ChatPanel";
import { loadPanel } from "./panel-data";

export type SlotSearch = { s?: string; hearing?: string; q?: string };

export async function ChatSlot({ path, searchParams }: { path?: string[]; searchParams: Promise<SlotSearch> }) {
  const sp = await searchParams;
  const db = await createClient();
  // who is asking is only used for the general context's brief: a case's or a client's chat does not wait for it
  const general = path?.[0] !== "cases" && path?.[0] !== "clients";
  const s = general ? await getSession(db) : null;
  return <ChatPanel data={await loadPanel(db, path, sp, s ? { userId: s.user.id, displayName: s.displayName } : null)} />;
}
