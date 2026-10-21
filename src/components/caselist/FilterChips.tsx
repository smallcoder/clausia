/**
 * Filters under / inside the search (query params only, so they work without JS):
 * - FilterChips: status with office-wide counts, plus «محتاجة مراجعة», as one single-select row (the mockup's chips).
 * - StageMenu: the stage (?stage=) as a compact menu at the end of the search field, so the chip row stays one line.
 */
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { CASE_STATUS, STAGE } from "@/lib/labels";

export type ListParams = { q?: string; stage?: string; status?: string; review?: string };
type Counts = { total: number; status: Record<keyof typeof CASE_STATUS, number>; stage: Record<keyof typeof STAGE, number> };

export function casesHref(sp: ListParams, patch: Partial<ListParams>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/cases?${s}` : "/cases";
}

function Chip({ on, to, tone = "plain", children }: { on: boolean; to: string; tone?: "plain" | "warn"; children: React.ReactNode }) {
  const cls = on
    ? "bg-primary-fill border-transparent font-bold"
    : tone === "warn"
      ? "border-border bg-warn-bg text-warn shadow-soft"
      : "border-border bg-chip text-text-2 shadow-soft hover:text-text";
  return (
    <Link href={to} aria-current={on ? "true" : undefined}
      className={`inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-[12.5px] font-semibold transition sm:h-[34px] sm:px-3.5 sm:text-[13px] ${cls}`}>
      {children}
    </Link>
  );
}

/** «الكل · 12» */
const Count = ({ n }: { n: number }) => <>{" · "}<span className="font-num">{n}</span></>;

export function FilterChips({ sp, counts, review }: { sp: ListParams; counts: Counts; review: number }) {
  const statuses = (Object.keys(CASE_STATUS) as (keyof typeof CASE_STATUS)[]).filter((k) => counts.status[k] > 0 || sp.status === k);
  return (
    <nav aria-label="تصفية حسب الحالة"
      className="no-scrollbar -mx-4 mt-2 flex items-center gap-1.5 overflow-x-auto px-4 py-1 sm:mx-0 sm:mt-2.5 sm:gap-2 sm:px-0">
      <Chip on={!sp.status && !sp.review} to={casesHref(sp, { status: undefined, review: undefined })}>الكل<Count n={counts.total} /></Chip>
      {statuses.map((k) => (
        <Chip key={k} on={sp.status === k} to={casesHref(sp, { status: k, review: undefined })}>{CASE_STATUS[k]}<Count n={counts.status[k]} /></Chip>
      ))}
      {review > 0 || sp.review ? (
        <Chip on={Boolean(sp.review)} tone="warn" to={casesHref(sp, { review: "1", status: undefined })}>محتاجة مراجعة<Count n={review} /></Chip>
      ) : null}
    </nav>
  );
}

export function StageMenu({ sp, counts }: { sp: ListParams; counts: Counts }) {
  const stages = (Object.keys(STAGE) as (keyof typeof STAGE)[]).filter((k) => counts.stage[k] > 0 || sp.stage === k);
  const current = sp.stage ? STAGE[sp.stage as keyof typeof STAGE] : null;
  const item = (on: boolean) => `flex h-10 items-center justify-between gap-3 rounded-xl px-3 text-[13.5px] ${on ? "bg-card-2 font-bold text-text" : "text-text-2 hover:bg-card-2"}`;
  return (
    <details className="group relative shrink-0">
      <summary aria-label="تصفية حسب الدرجة"
        className={`flex h-8 cursor-pointer list-none items-center gap-1 rounded-full border px-3 text-[12.5px] font-semibold [&::-webkit-details-marker]:hidden ${current ? "bg-primary-fill border-transparent" : "border-border bg-card-2 text-text-2"}`}>
        {current ?? "كل الدرجات"}
        <ChevronDown size={14} strokeWidth={2.2} aria-hidden className="transition group-open:rotate-180" />
      </summary>
      <div className="absolute end-0 top-10 z-30 w-48 rounded-2xl border border-border bg-card p-1.5 shadow-pop">
        <Link href={casesHref(sp, { stage: undefined })} className={item(!sp.stage)}>كل الدرجات <span className="font-num text-xs text-text-4">{counts.total}</span></Link>
        {stages.map((k) => (
          <Link key={k} href={casesHref(sp, { stage: k })} className={item(sp.stage === k)}>
            {STAGE[k]} <span className="font-num text-xs text-text-4">{counts.stage[k]}</span>
          </Link>
        ))}
      </div>
    </details>
  );
}
