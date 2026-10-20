// OWNER: case-pages agent (header + tab bar). Each tab body lives in components/case-tabs/* and is owned by its feature.
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { notFound } from "next/navigation";
import { ChatTab } from "@/components/case-tabs/ChatTab";
import { DocumentsTab } from "@/components/case-tabs/DocumentsTab";
import { FactsTab } from "@/components/case-tabs/FactsTab";
import { HearingsTab } from "@/components/case-tabs/HearingsTab";
import { JudgmentsTab } from "@/components/case-tabs/JudgmentsTab";
import { PartiesTab } from "@/components/case-tabs/PartiesTab";
import { RequestsArgumentsTab } from "@/components/case-tabs/RequestsArgumentsTab";
import { SummaryTab } from "@/components/case-tabs/SummaryTab";
import { Badge, DateText, cx } from "@/components/ui";
import { getCaseHeader } from "@/lib/cases";
import { todayIso } from "@/lib/dates";
import { CASE_STATUS, PARTY_ROLE, STAGE, caseLabel } from "@/lib/labels";
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab = "summary" } = await searchParams;
  if (!UUID.test(id)) notFound();
  const db = await createClient();
  const c = await getCaseHeader(db, id);
  if (!c) notFound();
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];
  const Body = current.C;
  const where = [c.court, c.circuit].filter(Boolean).join(" · ");
  const isToday = c.next_hearing === todayIso();

  return (
    <>
      <header className="mb-6">
        <Link href="/cases" className="-ms-1 inline-flex min-h-11 items-center gap-0.5 text-body text-accent hover:opacity-80"><ChevronRight aria-hidden size={20} strokeWidth={1.5} />القضايا</Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight text-ink lg:text-title">{caseLabel(c)}</h1>
            {c.title && (c.case_number || c.case_year) ? <p className="mt-1.5 text-body text-ink-2">{c.title}</p> : null}
            <p className="mt-1 text-callout text-ink-3">{where || "المحكمة غير محددة"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge>{STAGE[c.stage]}</Badge>
            <Badge tone={c.status === "reserved_for_judgment" ? "brass" : c.status === "judged" ? "ok" : c.status === "active" ? "accent" : "neutral"}>{CASE_STATUS[c.status]}</Badge>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3 rounded-[var(--radius)] bg-surface px-4 py-3.5 text-callout shadow-1 sm:flex sm:flex-wrap">
          <div className="min-w-0">
            <dt className="text-caption text-ink-3">الموكل</dt>
            <dd className="mt-0.5 font-medium text-ink">
              {c.client?.name ?? "—"}
              {c.client_role ? <span className="font-normal text-ink-2"> — {PARTY_ROLE[c.client_role]}</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-ink-3">الجلسة القادمة</dt>
            <dd className={cx("mt-0.5 font-medium", isToday ? "text-accent" : "text-ink")}>
              {c.next_hearing ? <><DateText iso={c.next_hearing} />{isToday ? " (اليوم)" : ""}</> : <span className="font-normal text-ink-3">لا جلسة قادمة</span>}
            </dd>
          </div>
        </dl>
      </header>
      <nav aria-label="أقسام ملف الدعوى" className="no-scrollbar -mx-4 mb-6 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <div className="inline-flex min-w-max gap-0.5 rounded-[var(--radius-sm)] bg-line/70 p-1">
        {TABS.map((t) => (
          <Link key={t.key} href={`/cases/${id}?tab=${t.key}`}
            aria-current={t.key === current.key ? "page" : undefined}
            className={cx("flex min-h-9 items-center whitespace-nowrap rounded-[8px] px-3.5 text-callout transition-colors duration-150", t.key === current.key ? "bg-surface font-semibold text-ink shadow-1" : "text-ink-2 hover:text-ink")}>
            {t.label}
          </Link>
        ))}
        </div>
      </nav>
      <Body caseId={id} />
    </>
  );
}
