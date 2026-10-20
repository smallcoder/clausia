// OWNER: case-pages agent (header + tab bar). Each tab body lives in components/case-tabs/* and is owned by its feature.
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatTab } from "@/components/case-tabs/ChatTab";
import { DocumentsTab } from "@/components/case-tabs/DocumentsTab";
import { FactsTab } from "@/components/case-tabs/FactsTab";
import { HearingsTab } from "@/components/case-tabs/HearingsTab";
import { JudgmentsTab } from "@/components/case-tabs/JudgmentsTab";
import { PartiesTab } from "@/components/case-tabs/PartiesTab";
import { RequestsArgumentsTab } from "@/components/case-tabs/RequestsArgumentsTab";
import { SummaryTab } from "@/components/case-tabs/SummaryTab";
import { PageHeader, cx } from "@/components/ui";
import { caseLabel } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

export const TABS = [
  { key: "summary", label: "الملخص", C: SummaryTab },
  { key: "facts", label: "الوقائع", C: FactsTab },
  { key: "parties", label: "الأطراف", C: PartiesTab },
  { key: "requests", label: "الطلبات والدفوع", C: RequestsArgumentsTab },
  { key: "hearings", label: "الجلسات", C: HearingsTab },
  { key: "documents", label: "المستندات", C: DocumentsTab },
  { key: "judgments", label: "الأحكام", C: JudgmentsTab },
  { key: "chat", label: "المحادثة", C: ChatTab },
] as const;

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab = "summary" } = await searchParams;
  const db = await createClient();
  const { data: c } = await db.from("cases").select("id, case_number, case_year, title, court").eq("id", id).maybeSingle();
  if (!c) notFound();
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];
  const Body = current.C;
  return (
    <>
      <PageHeader title={caseLabel(c)} subtitle={c.court ?? undefined} />
      <nav className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-line px-4 lg:mx-0 lg:px-0">
        {TABS.map((t) => (
          <Link key={t.key} href={`/cases/${id}?tab=${t.key}`}
            className={cx("whitespace-nowrap border-b-2 px-3 py-2.5 text-sm", t.key === current.key ? "border-accent font-semibold text-accent" : "border-transparent text-ink-2 hover:text-ink")}>
            {t.label}
          </Link>
        ))}
      </nav>
      <Body caseId={id} />
    </>
  );
}
