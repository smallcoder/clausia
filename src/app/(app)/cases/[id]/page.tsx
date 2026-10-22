// Case page (docs/design/*Case.dc.html, v2): who-first header with the spec sheet and stats, then the case overview
// (default) or one of the reachable views (?tab=hearings — hearings then judgments | documents | details; ?tab=chat
// is an old link: it opens the case page). The views and the JSON download are reached from the header's «…» menu.
// The chat is the panel beside the page (the @chat slot): the case's latest session, or ?s= / ?hearing=.
import { notFound, redirect } from "next/navigation";
import { DocumentsLegacy } from "@/components/case-tabs/DocumentsLegacy";
import { DocumentsTab } from "@/components/case-tabs/DocumentsTab";
import { HearingsTab } from "@/components/case-tabs/HearingsTab";
import { JudgmentsTab } from "@/components/case-tabs/JudgmentsTab";
import { CaseDetails } from "@/components/cases/CaseDetails";
import { CaseHeader, CaseSubHeader } from "@/components/cases/CaseHeader";
import { CaseOverview } from "@/components/cases/CaseOverview";
import { AddColumn } from "@/components/documents/AddColumn";
import { UploadDocument } from "@/components/documents/UploadDocument";
import { hearingState, pendingHref } from "@/components/cases/case-view";
import { getCaseFile, type CaseFile } from "@/lib/case-file";
import { docsTableEnabled } from "@/lib/flags";
import { todayIso } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIEWS = { hearings: "الجلسات", documents: "المستندات", details: "بيانات الدعوى" } as const;
/** the title of each view on desktop (the 34px title row); the short name above is the breadcrumb's last item and the phone's title */
const VIEW_TITLE = { hearings: "جلسات القضية", documents: "مستندات القضية", details: "بيانات الدعوى" } as const;
type View = keyof typeof VIEWS;

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { id } = await params;
  const { tab, q } = await searchParams;
  if (!UUID.test(id)) notFound();
  const db = await createClient();

  // `q` = a starter sentence for the composer (the brief's «اكتبلي مذكرة…» chip); it only fills the box, nothing is sent.
  // ?tab=chat is an old link (the chat is always beside the page now)
  if (tab === "chat") redirect(`/cases/${id}${q ? `?q=${encodeURIComponent(q.slice(0, 300))}` : ""}`);

  let cf: CaseFile;
  try {
    cf = await getCaseFile(db, id);
  } catch (e) {
    if (e instanceof Error && e.message === "case not found") notFound();
    throw e;
  }
  const table = docsTableEnabled(); // the documents table + «+ عمود جديد»: off by default (src/lib/flags.ts)
  const view: View | null = tab && tab in VIEWS ? (tab as View) : null;
  const today = todayIso();
  const hs = hearingState(cf.hearings, today);
  const pending = cf.pending_suggestions;
  // same rule as the Cases list: suggested items + past hearings with no recorded decision
  const undecidedPast = cf.hearings.filter((h) => h.date < today && !h.decision_type).length;
  const review = pending.length + undecidedPast;
  const reviewHref = pending.length ? `/cases/${id}${pendingHref(cf)}` : undecidedPast ? `/cases/${id}?tab=hearings` : undefined;

  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col px-4 sm:px-10">
      {view ? (
        <>
          <CaseSubHeader cf={cf} caseId={id} crumb={VIEWS[view]} title={VIEW_TITLE[view]} eyebrow={view === "documents" && table}
            stats={view === "documents" ? [{ value: cf.documents.length, label: "مستند" }] : view === "hearings" ? [{ value: cf.hearings.length, label: "جلسة" }] : []}
            action={view === "documents" ? (table ? <div className="flex items-center gap-2"><UploadDocument caseId={id} row compact /><AddColumn caseId={id} disabled={!cf.documents.length} /></div> : <UploadDocument caseId={id} row />) : null} />
          <div className="mt-5 sm:mt-4.5">
            {view === "hearings" ? <><HearingsTab caseId={id} /><JudgmentsTab cf={cf} caseId={id} /></> : view === "documents" ? (table ? <DocumentsTab caseId={id} cf={cf} /> : <DocumentsLegacy caseId={id} />) : <CaseDetails cf={cf} />}
          </div>
        </>
      ) : (
        <>
          <CaseHeader cf={cf} caseId={id} stats={[
            { value: cf.facts.length + pending.filter((p) => p.table === "case_facts").length, label: "وقائع", href: `/cases/${id}#facts` },
            { value: cf.documents.length, label: "مستندات", href: `/cases/${id}?tab=documents` },
            { value: review, label: "محتاجة مراجعة", highlight: true, href: reviewHref },
          ]} />
          <CaseOverview cf={cf} hs={hs} today={today} caseId={id} />
        </>
      )}
    </div>
  );
}
