// Case page (docs/design/*Case.dc.html, v2): who-first header with the spec sheet and stats, then the case overview
// (default) or one of the reachable views (?tab=hearings — hearings then judgments | documents | details; ?tab=chat
// goes to the case thread). The views and the JSON download are reached from the header's «…» menu.
// The Clausia composer is fixed at the bottom; its chips come from the case's real state.
import { notFound, redirect } from "next/navigation";
import { DocumentsTab } from "@/components/case-tabs/DocumentsTab";
import { HearingsTab } from "@/components/case-tabs/HearingsTab";
import { JudgmentsTab } from "@/components/case-tabs/JudgmentsTab";
import { CaseDetails } from "@/components/cases/CaseDetails";
import { CaseHeader, CaseSubHeader } from "@/components/cases/CaseHeader";
import { CaseOverview } from "@/components/cases/CaseOverview";
import { hearingState, pendingHref, shortDmy } from "@/components/cases/case-view";
import { Composer, type ComposerChip } from "@/components/shell/Composer";
import { getCaseFile, type CaseFile } from "@/lib/case-file";
import { todayIso } from "@/lib/dates";
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
  const pending = cf.pending_suggestions;
  // same rule as the Cases list: suggested items + past hearings with no recorded decision
  const undecidedPast = cf.hearings.filter((h) => h.date < today && !h.decision_type).length;
  const review = pending.length + undecidedPast;
  const reviewHref = pending.length ? `/cases/${id}${pendingHref(cf)}` : undecidedPast ? `/cases/${id}?tab=hearings` : undefined;

  const { data: thread } = await db.from("chat_threads").select("id").eq("case_id", id).order("created_at").limit(1).maybeSingle();
  const chatHref = thread ? `/chat/${thread.id}` : `/cases/${id}?tab=chat`;

  // a hearing whose decision is due: the latest past one without a decision, or today's
  const due = hs.undecided ?? (hs.next && hs.next.date === today && !hs.next.decision_type ? hs.next : null);
  const onlyFacts = pending.length > 0 && pending.every((p) => p.table === "case_facts");
  const chips: ComposerChip[] = view ? [] : [
    ...(due ? [{ label: `سجّل قرار جلسة ${shortDmy(due.date)}`, short: `سجّل قرار ${shortDmy(due.date)}`, text: `قرار جلسة ${shortDmy(due.date)}: `, icon: "gavel" as const }] : []),
    ...(pending.length ? [{
      label: onlyFacts ? (pending.length === 1 ? "راجع الواقعة المقترحة" : "راجع الوقائع المقترحة") : "راجع المقترحات",
      short: pending.length === 1 ? "راجع المقترحة" : "راجع المقترحات",
      text: "راجع معايا الحاجات المقترحة في القضية دي", accent: true, dot: true,
    }] : []),
    { label: "أضف مستند", attach: true, icon: "file" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-1 flex-col px-4 sm:px-10">
      {view ? (
        <>
          <CaseSubHeader cf={cf} caseId={id} title={VIEWS[view]} />
          <div className="mt-5 sm:mt-8">
            {view === "hearings" ? <><HearingsTab caseId={id} /><JudgmentsTab cf={cf} caseId={id} /></> : view === "documents" ? <DocumentsTab caseId={id} /> : <CaseDetails cf={cf} />}
          </div>
        </>
      ) : (
        <>
          <CaseHeader cf={cf} caseId={id} chatHref={chatHref} stats={[
            { value: cf.facts.length + pending.filter((p) => p.table === "case_facts").length, label: "وقائع", href: `/cases/${id}#facts` },
            { value: cf.documents.length, label: "مستندات", href: `/cases/${id}?tab=documents` },
            { value: review, label: "محتاجة مراجعة", highlight: true, href: reviewHref },
          ]} />
          <CaseOverview cf={cf} hs={hs} today={today} caseId={id} />
        </>
      )}

      <div className="min-h-6 flex-1" />
      <Composer target={{ kind: "case", caseId: id }} chips={chips}
        placeholder="اكتب لـ Clausia عن القضية دي… قرار جلسة، واقعة جديدة، أو أي سؤال" placeholderShort="اكتب لـ Clausia عن القضية دي…" />
    </div>
  );
}
