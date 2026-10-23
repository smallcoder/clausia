// The case page header (docs/design/ia/IACase*, MCase*): the dossier's fixed head, the same above every tab.
// Desktop: row 1 = back · breadcrumb «القضايا / <client>» … status chip, then «…»; row 2 = the case's subject as the title;
// row 3 = one solid card of 8 cells (4 × 2): number, court, circuit, next hearing | client + role, opponent + role,
// the opponent's lawyer, last decision. Phone: back + «…» floating, the number and the client as eyebrow, the title, then the
// same 8 cells two by two. A value that is not recorded says so («مش متسجل», faint), never a guess. A value the chat proposed
// to change keeps today's value struck and shows the new one in gold with the «مقترح» tag (header cells, next hearing, last decision).
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { CaseDetails } from "@/components/cases/CaseDetails";
import { DateText } from "@/components/ui";
import type { CaseFile } from "@/lib/case-file";
import type { PendingEdits } from "@/lib/edits";
import { CASE_STATUS } from "@/lib/labels";
import { CaseMenu } from "./CaseMenu";
import { ClientPicker, type PickerClient } from "./ClientPicker";
import { AskTarget } from "./AskTarget";
import { Change, SuggestedTag, Was } from "./Suggest";
import { caseSubject, headerCells, specSheet, statusTone, whoLine, type HearingState, type HeaderCell } from "./case-view";

const TONE = { good: ["bg-good", "text-good"], warn: ["bg-gold", "text-gold-on-ambient"], neutral: ["bg-text-4", "text-text-3"] } as const;

/** 28px outlined pill (content box, so 30px with its hairline), 6px dot, 12.5px semibold word. */
function StatusPill({ status, wash = false }: { status: string; wash?: boolean }) {
  const tone = statusTone(status);
  const [dot, text0] = TONE[tone];
  const text = wash && tone === "warn" ? "text-gold-text-small" : text0; // inside the gold wash the small gold text is the one that passes
  return (
    <span className={`box-content inline-flex h-7 items-center gap-1.5 rounded-full border border-border-2 px-3 text-sm font-semibold ${text}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />{CASE_STATUS[status as keyof typeof CASE_STATUS] ?? status}
    </span>
  );
}

/** The status chip; a proposed status shows the old word struck, the new chip in a gold wash and the «مقترح» tag. */
function StatusSlot({ status, proposed }: { status: string; proposed: string | null }) {
  if (!proposed) return <StatusPill status={status} />;
  return (
    <span className="inline-flex items-center gap-2">
      <Was>{CASE_STATUS[status as keyof typeof CASE_STATUS] ?? status}</Was>
      <span className="gold-wash rounded-full"><StatusPill status={proposed} wash /></span>
      <SuggestedTag />
    </span>
  );
}

/** 42px round glass buttons (mobile mockup). */
const ROUND = "tap glass glass-icon inline-flex size-control-lg shrink-0 items-center justify-center rounded-full";

/** a value the cell shows: «مش متسجل» when nothing is recorded */
const emptyText = (c: HeaderCell) => (c.key === "next_hearing" ? "مفيش جلسة جاية متسجلة" : c.key === "last_decision" ? "مفيش قرار متسجل" : c.fem ? "مش متسجلة" : "مش متسجل");
const full = (c: HeaderCell) => (c.value ? `${c.value}${c.extra ? ` · ${c.extra}` : ""}` : null);

export function CaseHeader({ cf, caseId, hs, today, edits, clients = [] }: { cf: CaseFile; caseId: string; hs: HearingState; today: string; edits?: PendingEdits; clients?: PickerClient[] }) {
  const who = whoLine(cf);
  const cells = headerCells(cf, hs, today);
  const number = cells[0].value;
  // fields the chat proposed to change: the cell keeps today's value struck and shows the new one in gold
  const patch = edits?.casePatch;
  const spec = specSheet(cf);
  const after = patch ? specSheet({ ...cf, case: { ...cf.case, ...(patch as Partial<CaseFile["case"]>) } }) : null;
  const caseChange = (i: number) => (after && i < 3 && (after[i].value !== spec[i].value || after[i].extra !== spec[i].extra) ? full({ ...cells[i], value: after[i].value, extra: after[i].extra }) : null);
  // the decisions the chat proposed: the next hearing's date and the decision (the last of each)
  const rows = (edits?.decisions ?? []).flatMap((d) => d.rows);
  const proposed = (key: string) => rows.filter((r) => r.key === key).at(-1);
  const change = (i: number): { old: string | null; next: string } | null => {
    const c = cells[i];
    if (i < 3) { const n = caseChange(i); return n ? { old: full(c), next: n } : null; }
    const r = c.key === "next_hearing" ? proposed("next_date") : c.key === "last_decision" ? proposed("decision") : undefined;
    return r ? { old: r.old, next: r.new } : null;
  };
  const proposedStatus = patch?.status && patch.status !== cf.case.status ? patch.status : null;

  return (
    <header className="leading-[1.35]">
      {/* phone: back + more at 14px from the top and the sides */}
      <div className="-mx-0.5 flex items-center justify-between pt-3.5 sm:hidden">
        <Link href="/cases" aria-label="رجوع" className={ROUND}><ChevronRight size={20} strokeWidth={2} aria-hidden /></Link>
        <CaseMenu caseId={caseId} align="end" className="size-control-lg" />
      </div>

      {/* desktop row 1: 40px back · breadcrumb … status chip · «…» */}
      <div className="hidden items-center gap-3 px-2 pt-6 sm:flex">
        <Link href="/cases" aria-label="رجوع" className={`${ROUND} sm:size-10`}><ChevronRight size={20} strokeWidth={2.2} aria-hidden /></Link>
        <nav aria-label="المسار" className="min-w-0 flex-1 truncate text-sm text-text-3">
          <Link href="/cases" className="tap hover:text-text hover:underline">القضايا</Link>
          <span aria-hidden className="mx-1.5 text-text-4">/</span><span className="font-semibold text-text">{who.client ?? who.fallback}</span>
        </nav>
        <StatusSlot status={cf.case.status} proposed={proposedStatus} />
        <CaseMenu caseId={caseId} align="end" className="size-10" />
      </div>

      {/* the title: the case's subject; on the phone the number and the client sit above it, with the status */}
      <div className="px-1 pt-4.5 sm:mt-4 sm:px-2 sm:pt-0">
        <div className="flex items-center justify-between gap-3 sm:hidden">
          <span className="min-w-0 truncate text-sm text-text-3">{[number, who.client].filter(Boolean).join(" · ")}</span>
          <StatusSlot status={cf.case.status} proposed={proposedStatus} />
        </div>
        <h1 className="mt-1.5 text-xl font-bold leading-[1.2] text-title sm:mt-0 sm:text-page-title sm:leading-[1.1]">{caseSubject(cf)}</h1>
      </div>

      {/* the 8 cells: it follows the width of its own column (the chat panel sits beside the page); 4 × 2 when the column is wide, else 2 × 4 */}
      <div className="@container mt-4 sm:mt-4.5">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border-2 bg-border-2 shadow-card @3xl:grid-cols-4">
          {cells.map((c, i) => {
            const ch = change(i);
            const ask = { kind: "field" as const, id: caseId, field: c.key, label: `${c.label} · ${full(c) ?? "غير مسجل"}` };
            // the client cell is the one-home link to the client's page, with «حدد الموكل» (no client yet) or «تغيير» beside it
            if (c.key === "client") {
              const text = full(c);
              return (
                <AskTarget key={c.key} inside item={ask} className="min-w-0 bg-card px-3.5 py-3 @3xl:px-5 @3xl:py-3.5">
                  <dt className="text-xs text-text-4">{c.label}</dt>
                  <dd className="mt-1 flex min-w-0 items-center gap-2.5 text-base leading-[1.4] @3xl:text-md">
                    {text ? (cf.client
                      ? <Link href={`/clients/${cf.client.id}`} title={text} className="tap min-w-0 truncate font-semibold text-text hover:underline">{text}</Link>
                      : <span title={text} className="min-w-0 truncate font-semibold text-text">{text}</span>) : <span className="text-text-4">{emptyText(c)}</span>}
                    <ClientPicker caseId={caseId} clients={clients} currentId={cf.client?.id ?? null} />
                  </dd>
                </AskTarget>
              );
            }
            return (
              <AskTarget key={c.key} inside item={ask} className={`min-w-0 bg-card px-3.5 py-3 @3xl:px-5 @3xl:py-3.5 ${ch ? "gold-wash" : ""}`}>
                <dt className={ch ? "flex items-center gap-1.5 text-xs text-gold-text-small" : "text-xs text-text-4"}>{c.label}{ch ? <SuggestedTag /> : null}</dt>
                <dd title={c.clip && c.value ? c.value : undefined}
                  className={`mt-1 text-base leading-[1.4] @3xl:text-md ${c.clip ? "truncate" : ""} ${c.value ? `font-semibold ${c.gold ? "text-gold" : "text-text"}` : "text-text-4"}`}>
                  {ch ? <Change old={ch.old} next={ch.next} />
                    : c.value ? <>{c.iso ? <DateText iso={c.iso} /> : c.value}{c.extra ? ` · ${c.extra}` : null}</>
                    : emptyText(c)}
                </dd>
              </AskTarget>
            );
          })}
        </dl>
      </div>

      {/* the case's own fields (facts date, status, circuit, type, the stages): the case page is their home */}
      <details className="group mt-2">
        <summary className="tap inline-flex min-h-8 cursor-pointer list-none items-center rounded-md px-2 text-sm text-text-3 hover:text-text [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">تعديل بيانات الدعوى</span><span className="hidden group-open:inline">إخفاء بيانات الدعوى</span>
        </summary>
        <div className="mt-2"><CaseDetails cf={cf} /></div>
      </details>
    </header>
  );
}
