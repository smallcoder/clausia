// OWNER: case-pages agent (hero + segmented control). Tab bodies: CaseFileView + components/case-tabs/*.
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { notFound } from "next/navigation";
import { ChatTab } from "@/components/case-tabs/ChatTab";
import { DocumentsTab } from "@/components/case-tabs/DocumentsTab";
import { HearingsTab } from "@/components/case-tabs/HearingsTab";
import { CaseFileView } from "@/components/cases/CaseFileView";
import { CaseHero } from "@/components/cases/CaseHero";
import { cx } from "@/components/ui";
import { getCaseHeader } from "@/lib/cases";
import { todayIso } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export const TABS = [
  { key: "file", label: "الملف", C: CaseFileView },
  { key: "hearings", label: "الجلسات", C: HearingsTab },
  { key: "documents", label: "المستندات", C: DocumentsTab },
  { key: "chat", label: "المحادثة", C: ChatTab },
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab = "file" } = await searchParams;
  if (!UUID.test(id)) notFound();
  const db = await createClient();
  const c = await getCaseHeader(db, id);
  if (!c) notFound();
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];
  const Body = current.C;

  return (
    <div className="mx-auto w-full max-w-[760px]">
      <Link href="/cases" className="-ms-1 inline-flex min-h-11 items-center gap-0.5 text-body text-accent hover:opacity-80"><ChevronRight aria-hidden size={20} strokeWidth={1.5} />القضايا</Link>
      <CaseHero c={c} isToday={c.next_hearing === todayIso()} />
      <nav aria-label="أقسام ملف الدعوى" className="my-6">
        <div className="grid grid-cols-4 gap-0.5 rounded-[var(--radius-sm)] bg-surface-2 p-1">
          {TABS.map((t) => (
            <Link key={t.key} href={`/cases/${id}?tab=${t.key}`}
              aria-current={t.key === current.key ? "page" : undefined}
              className={cx("flex min-h-9 items-center justify-center whitespace-nowrap rounded-[8px] px-2 text-[13px] transition-colors duration-150 sm:text-callout", t.key === current.key ? "bg-surface font-semibold text-ink shadow-1" : "text-ink-2 hover:text-ink")}>
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
      <Body caseId={id} />
    </div>
  );
}
