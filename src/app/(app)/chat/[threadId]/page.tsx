// An old link to one conversation: the chat is the panel beside every page now, so this opens the session there —
// a case's session on the case page (/cases/<id>?s=<thread>), a general one on Home (/?s=<thread>).
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ThreadPage({ params, searchParams }: { params: Promise<{ threadId: string }>; searchParams: Promise<{ q?: string }> }) {
  const { threadId } = await params;
  const { q } = await searchParams;
  if (!UUID.test(threadId)) notFound();
  const db = await createClient();
  const { data: t } = await db.from("chat_threads").select("id, case_id").eq("id", threadId).maybeSingle();
  if (!t) notFound();
  const query = new URLSearchParams({ s: t.id });
  if (q) query.set("q", q.slice(0, 300));
  redirect(`${t.case_id ? `/cases/${t.case_id}` : "/"}?${query}`);
}
