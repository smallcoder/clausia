// The case dossier (docs/design/ia/IACase*, MCase*): one fixed header (8 cells), five tabs with their counts, and the active tab's content.
//   ?tab=hearings (default) | sides | facts | documents | memos. Old names still work (details, parties, requests, judgments …: see
//   components/cases/dossier.ts) and are redirected to the new one; ?tab=chat is an old link: the chat is always the panel beside the page.
// The chat is that panel (the @chat slot): the case's latest session, or ?s= / ?hearing= (the agenda's links); they stay when the tab changes.
// Each object has one home: hearings and decisions → «الجلسات»; requests and defenses → «الطلبات والدفوع»; facts and parties → «الوقائع»;
// documents → «المستندات»; judgments → «المذكرات والأحكام». Edits the chat proposed show in the tab that holds them, and the bar below confirms them.
import { notFound, redirect } from "next/navigation";
import { DocumentsTab } from "@/components/case-tabs/DocumentsTab";
import { HearingsTab } from "@/components/case-tabs/HearingsTab";
import { MemosTab } from "@/components/case-tabs/MemosTab";
import { CaseHeader } from "@/components/cases/CaseHeader";
import { Facts, Parties, Sides } from "@/components/cases/CaseItems";
import { CaseTabBar } from "@/components/cases/CaseTabBar";
import { ConfirmBar } from "@/components/cases/ConfirmBar";
import { hearingState } from "@/components/cases/case-view";
import { resolveTab, tabCounts, tabHref } from "@/components/cases/dossier";
import { getCaseFile, type CaseFile } from "@/lib/case-file";
import { getDraft, listDrafts } from "@/lib/library/list";
import { pickableClients } from "@/lib/clients";
import { loadPendingEdits } from "@/lib/pending-edits";
import { todayIso } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; q?: string; s?: string; hearing?: string; sheet?: string; draft?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { tab, q } = sp;
  if (!UUID.test(id)) notFound();

  // `q` = a starter sentence for the composer (the «اكتبلي مذكرة…» chip); it only fills the box, nothing is sent.
  // ?tab=chat is an old link (the chat is always beside the page now)
  if (tab === "chat") redirect(`/cases/${id}${q ? `?q=${encodeURIComponent(q.slice(0, 300))}` : ""}`);
  const keep = { s: sp.s, hearing: sp.hearing, sheet: sp.sheet }; // stay in the address when the tab changes (the chat session, the phone sheet)
  const resolved = resolveTab(tab);
  // an old tab name: the address is rewritten to the new one, the chat's parts (s, hearing, q) stay
  if (!resolved.canonical) redirect(tabHref(id, resolved.key, { ...keep, q: q ? q.slice(0, 300) : undefined }));
  const active = resolved.key;

  const db = await createClient();
  let cf: CaseFile;
  try {
    cf = await getCaseFile(db, id);
  } catch (e) {
    if (e instanceof Error && e.message === "case not found") notFound();
    throw e;
  }
  // edits the chat proposed and the lawyer has not confirmed: shown in the tab that holds them (read through RLS, this case only)
  // the case's drafts from the library (the «المذكرات والأحكام» tab and its count); `?draft=` opens one, read only
  const [edits, clients, drafts] = await Promise.all([loadPendingEdits(db, id, cf), pickableClients(db), listDrafts(db, id)]);
  const openDraft = active === "memos" && sp.draft && UUID.test(sp.draft) ? await getDraft(db, id, sp.draft) : null;
  const today = todayIso();
  const hs = hearingState(cf.hearings, today);

  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col px-4 sm:px-10">
      <CaseHeader cf={cf} caseId={id} hs={hs} today={today} edits={edits} clients={clients} />
      <CaseTabBar caseId={id} active={active} counts={tabCounts(cf, today, drafts.length)} keep={keep} />
      <div className="mt-4 sm:mt-5">
        {active === "hearings" ? <HearingsTab caseId={id} today={today} edits={edits} />
          : active === "sides" ? <div className="pb-4"><Sides cf={cf} caseId={id} edits={edits} className="" /></div>
          : active === "facts" ? <div className="space-y-4 pb-4"><Facts cf={cf} caseId={id} edits={edits} /><Parties cf={cf} caseId={id} edits={edits} /></div>
          : active === "documents" ? <DocumentsTab caseId={id} cf={cf} />
          : <MemosTab cf={cf} caseId={id} drafts={drafts} draft={openDraft} />}
      </div>
      {edits?.groups.length ? <ConfirmBar groups={edits.groups} count={edits.count} /> : null}
    </div>
  );
}
