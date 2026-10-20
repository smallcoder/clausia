// One conversation (general, or a case's own thread).
import Link from "next/link";
import { notFound } from "next/navigation";
import { ThreadView } from "@/components/chat/ThreadView";
import { PageHeader } from "@/components/ui";
import { caseLabel } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  if (!UUID.test(threadId)) notFound();
  const db = await createClient();
  const { data: t } = await db.from("chat_threads").select("id, title, case_id").eq("id", threadId).maybeSingle();
  if (!t) notFound();
  const c = t.case_id ? (await db.from("cases").select("id, case_number, case_year, title, court").eq("id", t.case_id).maybeSingle()).data : null;
  return (
    <>
      <div className="mb-2">
        <Link href="/chat" className="text-sm text-ink-3 hover:text-ink">→ المحادثات</Link>
      </div>
      <PageHeader
        title={c ? caseLabel(c) : t.title || "محادثة"}
        subtitle={c ? <Link href={`/cases/${c.id}`} className="text-accent hover:underline">{c.court ? `${c.court} · ` : ""}فتح ملف الدعوى</Link> : "محادثة عامة: موكلون ودعاوى جديدة"}
      />
      <ThreadView db={db} threadId={t.id} caseId={t.case_id} />
    </>
  );
}
