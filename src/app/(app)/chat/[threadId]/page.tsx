// One conversation with Clausia (general, or a case's own thread), per the v2 Chat mockups: no page header.
// Desktop: a small centered glass pill (kind of chat · client/case). Mobile (the main top bar is hidden here):
// the thread's own top row — back, a glass title pill (C · Clausia · client/case), new chat. Then the messages,
// cards and the docked composer.
import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ChatThread } from "@/components/chat/ChatThread";
import { loadThread } from "@/components/chat/ThreadView";
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
  // a general thread that proposes a new client is labelled with that client (the latest card's)
  const proposedClient = [...ops].reverse().find((o) => o.tool === "create_client" && o.status !== "rejected" && typeof o.args.name === "string")?.args.name as string | undefined;

  // the mockup's «محادثة جديدة · موكلة جديدة · رانيا التجريبية»: kind of chat · who / which case
  const kind = t.case_id ? "محادثة القضية" : c || proposedClient ? "محادثة جديدة" : "محادثة عامة";
  const label = c
    ? [clientName, caseLabel(c)].filter(Boolean).join(" · ")
    : proposedClient ? `موكل جديد · ${proposedClient}` : t.title || "محادثة مع Clausia";
  const caseHref = c ? `/cases/${c.id}` : null;
  const back = t.case_id ? `/cases/${t.case_id}` : "/chat";

  return (
    <div className="mx-auto flex w-full flex-1 flex-col gap-[18px] px-3.5 sm:max-w-[820px] sm:gap-[22px] sm:px-6 sm:pt-5">
      {/* mobile: the thread's own top row (sticky, glass: floating controls), over a soft page-colour fade so the
          messages scrolling under it do not show through the glass */}
      <div className="sticky top-0 z-40 -mx-3.5 -mb-[18px] flex items-center gap-2.5 bg-[linear-gradient(to_bottom,var(--bg)_70%,transparent)] px-3.5 pb-6 pt-3.5 sm:hidden">
        <Link href={back} aria-label={t.case_id ? "رجوع لملف القضية" : "رجوع للمحادثات"} className={ROUND}>
          <ChevronRight aria-hidden size={20} strokeWidth={2.2} />
        </Link>
        <MaybeLink href={caseHref} className="glass flex h-[42px] min-w-0 flex-1 items-center gap-2.5 rounded-full pe-3.5 ps-1.5">
          <span aria-hidden className="mark font-num inline-flex size-7 shrink-0 items-center justify-center rounded-[9px] text-[13px] font-extrabold">C</span>
          <span className="min-w-0 leading-[1.2]">
            <span className="font-num block text-[14px] font-bold text-title">Clausia</span>
            <span className="block truncate text-[11px] text-text-3">{label}</span>
          </span>
        </MaybeLink>
        <Link href="/chat" aria-label="محادثة جديدة" title="محادثة جديدة" className={ROUND}>
          <Plus aria-hidden size={19} strokeWidth={1.9} />
        </Link>
      </div>

      {/* desktop: the small centered glass pill, nothing else above the first message */}
      <MaybeLink href={caseHref} className="glass hidden h-8 max-w-full items-center gap-2 self-center rounded-2xl px-3.5 text-[12.5px] sm:inline-flex">
        <span className="shrink-0 text-text-3">{kind}</span>
        <span aria-hidden className="text-text-4">·</span>
        <span className="truncate font-semibold text-text">{label}</span>
      </MaybeLink>

      <div className="flex flex-1 flex-col">
        <ChatThread threadId={t.id} caseId={t.case_id} items={data.items} lookup={data.lookup} docs={data.docs} />
      </div>
    </div>
  );
}

const ROUND = "glass glass-icon inline-flex size-[42px] shrink-0 items-center justify-center rounded-full transition hover:text-text";

/** The pill opens the case file when the conversation has one; otherwise it is just a label. */
function MaybeLink({ href, className, children }: { href: string | null; className: string; children: ReactNode }) {
  return href
    ? <Link href={href} title="فتح ملف القضية" className={`${className} transition hover:opacity-85`}>{children}</Link>
    : <div className={className}>{children}</div>;
}
