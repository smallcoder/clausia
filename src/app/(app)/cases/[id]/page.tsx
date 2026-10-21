// Case page (docs/design/*Case.dc.html): hero, then the case overview (default) or one of the reachable views
// (?tab=hearings | documents | details; ?tab=chat goes to the case thread). The Clausia composer is at the bottom.
import { ChevronRight, Scale } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DocumentsTab } from "@/components/case-tabs/DocumentsTab";
import { HearingsTab } from "@/components/case-tabs/HearingsTab";
import { CaseDetails } from "@/components/cases/CaseDetails";
import { CaseOverview } from "@/components/cases/CaseOverview";
import { hearingState, heroEyebrow, heroSubject, heroTitle, pendingHref, shortDmy, statusTone } from "@/components/cases/case-view";
import { Composer } from "@/components/shell/Composer";
import { PageHero, StatusChip } from "@/components/shell/PageHero";
import { getCaseFile, type CaseFile } from "@/lib/case-file";
import { todayIso } from "@/lib/dates";
import { CASE_STATUS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateCaseThread } from "@/lib/threads";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIEWS = { hearings: "الجلسات", documents: "المستندات", details: "بيانات الدعوى" } as const;
type View = keyof typeof VIEWS;

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  if (!UUID.test(id)) notFound();
  const db = await createClient();

  if (tab === "chat") redirect(`/chat/${await getOrCreateCaseThread(db, id)}`);

  let cf: CaseFile;
  try {
    cf = await getCaseFile(db, id);
  } catch (e) {
    if (e instanceof Error && e.message === "case not found") notFound();
    throw e;
  }
  const view: View | null = tab && tab in VIEWS ? (tab as View) : null;
  const today = todayIso();
  const hs = hearingState(cf.hearings, today);
  const title = heroTitle(cf);
  const subject = heroSubject(cf, title);
  const c = cf.case;
  const pending = cf.pending_suggestions.length;

  const { data: thread } = await db.from("chat_threads").select("id").eq("case_id", id).order("created_at").limit(1).maybeSingle();
  const chatHref = thread ? `/chat/${thread.id}` : `/cases/${id}?tab=chat`;

  const due = hs.undecided ?? (hs.next && hs.next.date === today && !hs.next.decision_type ? hs.next : null);
  const chips = view ? [] : [
    ...(due ? [{ label: `سجّل قرار جلسة ${shortDmy(due.date)}`, short: "سجّل قرار الجلسة", text: `قرار جلسة ${shortDmy(due.date)}: ` }] : []),
    ...(pending ? [{ label: cf.pending_suggestions.every((p) => p.table === "case_facts") ? "راجع الوقائع المقترحة" : "راجع المقترحات", text: "راجع معايا الحاجات المقترحة في القضية دي" }] : []),
    { label: "أضف مستند", attach: true },
    { label: "اكتب رأي قانوني · قريبًا", ghost: true, disabled: true },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col px-2.5 pt-2.5 sm:px-10 sm:pt-4">
      <PageHero
        back="/cases"
        icon={<Scale className="size-[27px] sm:size-[30px]" strokeWidth={2} aria-hidden />}
        eyebrow={heroEyebrow(cf)}
        title={title}
        subtitle={<>
          {subject || c.court ? (
            <span>{subject}{subject && c.court ? <span className="hidden sm:inline"> · </span> : null}{c.court ? <span className={subject ? "hidden sm:inline" : ""}>{c.court}</span> : null}</span>
          ) : null}
          <StatusChip tone={statusTone(c.status)}>{CASE_STATUS[c.status as keyof typeof CASE_STATUS] ?? c.status}</StatusChip>
        </>}
        stats={[
          { value: cf.facts.length, label: "وقائع", href: `/cases/${id}#facts` },
          { value: cf.documents.length, label: "مستندات", href: `/cases/${id}?tab=documents` },
          { value: pending, label: "محتاجة مراجعة", highlight: pending > 0, href: pending ? `/cases/${id}${pendingHref(cf)}` : undefined },
        ]}
      />

      <div className="px-1.5 sm:px-0">
        {view ? (
          <div className="mt-5 sm:mt-6">
            <div className="mb-4 flex items-center gap-2">
              <Link href={`/cases/${id}`} className="-ms-1 inline-flex min-h-10 items-center gap-0.5 text-[14px] font-semibold text-gold-text hover:underline">
                <ChevronRight size={18} strokeWidth={2.2} aria-hidden />ملف القضية
              </Link>
              <span className="text-text-4">/</span>
              <h2 className="text-[17px] font-bold text-text">{VIEWS[view]}</h2>
            </div>
            {view === "hearings" ? <HearingsTab caseId={id} /> : view === "documents" ? <DocumentsTab caseId={id} /> : <CaseDetails cf={cf} />}
          </div>
        ) : (
          <CaseOverview cf={cf} hs={hs} today={today} caseId={id} chatHref={chatHref} />
        )}
      </div>

      <div className="min-h-6 flex-1" />
      <div className="mx-auto w-full max-w-[820px] px-0.5 sm:px-0 sm:pb-2">
        <Composer target={{ kind: "case", caseId: id }} chips={chips}
          placeholder="اكتب لـ Clausia عن القضية دي…" />
      </div>
    </div>
  );
}
