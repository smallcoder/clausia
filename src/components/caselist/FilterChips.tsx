/**
 * The cases list filter row (docs/design/*Cases.dc.html): «الكل · 12», one capsule per status with office-wide
 * counts, and «محتاجة مراجعة» when anything needs review. Plain links (query params), so they work without JS.
 * Not glass: the row sits on the page, not over content. The selected capsule is the ink fill.
 * `?q=` and `?stage=` have no capsule (the composer searches); when one is active it shows as a clearable pill.
 */
import { X } from "lucide-react";
import Link from "next/link";
import { CASE_STATUS, STAGE } from "@/lib/labels";

export type ListParams = { q?: string; stage?: string; status?: string; review?: string };
type Counts = { total: number; status: Record<keyof typeof CASE_STATUS, number>; stage: Record<keyof typeof STAGE, number> };

/** shorter status words for the phone row (mockup: «محجوزة · 2») */
const SHORT: Partial<Record<keyof typeof CASE_STATUS, string>> = { reserved_for_judgment: "محجوزة", judged: "فيها حكم" };

export function casesHref(sp: ListParams, patch: Partial<ListParams>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/cases?${s}` : "/cases";
}

/** 44px tap target on phones, the visible capsule is 32/34px as in the mockups. */
function Capsule({ on, to, children }: { on: boolean; to: string; children: React.ReactNode }) {
  return (
    <Link href={to} aria-current={on ? "true" : undefined} className="group inline-flex h-11 shrink-0 items-center sm:h-[34px]">
      <span className={`inline-flex h-8 items-center whitespace-nowrap rounded-full px-[13px] text-[12.5px] transition sm:h-[34px] sm:px-[15px] sm:text-[13px] ${on ? "bg-selected font-semibold text-on-selected shadow-soft" : "font-medium text-text-3 group-hover:text-text"}`}>
        {children}
      </span>
    </Link>
  );
}

/** «الكل · 12» */
const Count = ({ n }: { n: number }) => <><span aria-hidden className="mx-1">·</span><span className="sr-only"> </span><span className="font-num">{n}</span></>;

export function FilterChips({ sp, counts, review }: { sp: ListParams; counts: Counts; review: number }) {
  const statuses = (Object.keys(CASE_STATUS) as (keyof typeof CASE_STATUS)[]).filter((k) => counts.status[k] > 0 || sp.status === k);
  const stage = sp.stage ? STAGE[sp.stage as keyof typeof STAGE] : null;
  return (
    <nav aria-label="تصفية القضايا" className="no-scrollbar -mx-4 mt-5 flex items-center gap-0.5 overflow-x-auto px-4 sm:mx-0 sm:mt-[34px] sm:gap-1 sm:px-1">
      <Capsule on={!sp.status && !sp.review} to={casesHref(sp, { status: undefined, review: undefined })}>الكل<Count n={counts.total} /></Capsule>
      {statuses.map((k) => (
        <Capsule key={k} on={sp.status === k} to={casesHref(sp, { status: k, review: undefined })}>
          {SHORT[k] ? <><span className="sm:hidden">{SHORT[k]}</span><span className="hidden sm:inline">{CASE_STATUS[k]}</span></> : CASE_STATUS[k]}
          <Count n={counts.status[k]} />
        </Capsule>
      ))}
      {review > 0 || sp.review ? (
        <Capsule on={Boolean(sp.review)} to={casesHref(sp, { review: "1", status: undefined })}>محتاجة مراجعة<Count n={review} /></Capsule>
      ) : null}
      {stage ? <ClearPill label={stage} to={casesHref(sp, { stage: undefined })} /> : null}
      {sp.q ? <ClearPill label={`«${sp.q}»`} to={casesHref(sp, { q: undefined })} /> : null}
    </nav>
  );
}

/** an active filter without a capsule of its own (?stage=, ?q=): shown with an × that removes it */
function ClearPill({ label, to }: { label: string; to: string }) {
  return (
    <Link href={to} aria-label={`شيل التصفية ${label}`} className="group inline-flex h-11 shrink-0 items-center ps-1 sm:h-[34px]">
      <span className="inline-flex h-8 max-w-[220px] items-center gap-1.5 rounded-full border border-border px-3 text-[12.5px] font-semibold text-text sm:h-[34px] sm:text-[13px]">
        <span className="truncate">{label}</span>
        <X size={14} strokeWidth={2.2} aria-hidden className="shrink-0 text-text-4 group-hover:text-text" />
      </span>
    </Link>
  );
}
