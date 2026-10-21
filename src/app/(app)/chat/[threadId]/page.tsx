import { Plus } from "lucide-react";
// One conversation with Clausia (general, or a case's own thread): hero, messages, cards, docked composer.
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatThread } from "@/components/chat/ChatThread";
import { loadThread } from "@/components/chat/ThreadView";
import { PageHero } from "@/components/shell/PageHero";
import { caseLabel } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  if (!UUID.test(threadId)) notFound();
  const db = await createClient();
  const { data: t } = await db.from("chat_threads").select("id, title, case_id").eq("id", threadId).maybeSingle();
  if (!t) notFound();
  const data = await loadThread(db, t.id);

  // The case this conversation is about: the thread's own case, else one a card in it created.
  const ops = data.proposals.flatMap((p) => p.ops);
  const createdCaseId = ops.find((o) => o.tool === "create_case" && o.result_id && (o.status === "confirmed" || o.status === "suggested"))?.result_id ?? null;
  const caseId = t.case_id ?? createdCaseId;
  const c = caseId ? (await db.from("cases").select("id, case_number, case_year, title, court, client_id").eq("id", caseId).maybeSingle()).data : null;
  const clientName = c?.client_id ? (await db.from("clients").select("name").eq("id", c.client_id).maybeSingle()).data?.name ?? null : null;
  // a general thread that proposes a new client is titled with that client (the latest card's)
  const proposedClient = [...ops].reverse().find((o) => o.tool === "create_client" && o.status !== "rejected" && typeof o.args.name === "string")?.args.name as string | undefined;

  const eyebrow = `محادثة مع Clausia · ${c ? caseLabel(c) : proposedClient ? "موكل جديد" : "محادثة عامة"}`;
  const title = clientName ?? proposedClient ?? (c ? caseLabel(c) : t.title || "محادثة جديدة");

  return (
    <div className="mx-auto flex w-full max-w-[1024px] flex-1 flex-col gap-7 px-3.5 pt-2.5 sm:gap-9 sm:px-8 sm:pt-5">
      <PageHero
        action={<Link href="/chat" aria-label="محادثة جديدة" title="محادثة جديدة" className="glass glass-icon hidden size-11 sm:inline-flex shrink-0 items-center justify-center rounded-full transition hover:text-text"><Plus size={19} strokeWidth={1.9} aria-hidden /></Link>}
        back="/chat"
        icon={<span className="font-num text-[25px] font-black sm:text-[30px]">C</span>}
        eyebrow={eyebrow}
        title={title}
        subtitle={c ? <Link href={`/cases/${c.id}`} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-text-2 hover:text-text hover:underline">{c.court ? <span className="hidden sm:inline">{c.court} ·</span> : null}<span className="whitespace-nowrap">فتح ملف القضية ←</span></Link> : undefined}
        stats={[
          { value: data.stats.docsRead, label: "ورقة اتقرت" },
          { value: data.stats.readyOps, label: "عناصر جاهزة" },
          { value: data.stats.openQuestion, label: "سؤال مستنيك", highlight: true },
        ]}
      />
      <div className="flex flex-1 flex-col">
        <ChatThread threadId={t.id} caseId={t.case_id} items={data.items} lookup={data.lookup} docs={data.docs} />
      </div>
    </div>
  );
}
