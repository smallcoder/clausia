import "server-only";
// The chat panel's server side, shared by the two pages of the layout's @chat slot (Home "/" and every deeper path).
import { createClient } from "@/lib/supabase/server";
import { ChatPanel } from "./ChatPanel";
import { loadPanel } from "./panel-data";

export type SlotSearch = { s?: string; hearing?: string; q?: string };

export async function ChatSlot({ path, searchParams }: { path?: string[]; searchParams: Promise<SlotSearch> }) {
  const sp = await searchParams;
  const db = await createClient();
  return <ChatPanel data={await loadPanel(db, path, sp)} />;
}
