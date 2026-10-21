/**
 * The cases list filter row (docs/design/*Cases.dc.html): «الكل · 12» and one capsule per status with office-wide
 * counts (every status that has cases, not only the drawn three; on phones the row scrolls sideways).
 * Plain links (query params), so they work without JS. Not glass: the row sits on the page, not over content.
 * The selected capsule is the ink fill. `?decision=1` (the «محتاجة قرار» stat), `?review=1`, `?stage=` and `?q=`
 * have no capsule; when one is active it shows as a clearable pill, first in the row.
 */
import { X } from "lucide-react";
import Link from "next/link";
import { CASE_STATUS, STAGE } from "@/lib/labels";

export type ListParams = { q?: string; stage?: string; status?: string; review?: string; decision?: string };
type Counts = { total: number; status: Record<keyof typeof CASE_STATUS, number>; stage: Record<keyof typeof STAGE, number> };

/** shorter status words for the phone row (mockup: «محجوزة · 2») */
const SHORT: Partial<Record<keyof typeof CASE_STATUS, string>> = { reserved_for_judgment: "محجوزة", judged: "فيها حكم" };

export function casesHref(sp: ListParams, patch: Partial<ListParams>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/cases?${s}` : "/cases";
}

/** The capsule is drawn 32/34px as in the mockups; `.tap` gives it the invisible 44px tap area. */
function Capsule({ on, to, children }: { on: boolean; to: string; children: React.ReactNode }) {
  return (
    <Link href={to} aria-current={on ? "true" : undefined} className="tap group inline-flex shrink-0 items-center">
      <span className={`inline-flex h-8 items-center whitespace-nowrap rounded-full px-3.25 text-sm transition sm:h-chip sm:px-3.75 ${on ? "bg-selected font-semibold text-on-selected shadow-[var(--tab-shadow)]" : "font-medium glass-icon group-hover:text-text"}`}>
        {/* one inline run, so the spaces around «·» survive (bare flex items trim them) */}
        <span>{children}</span>
      </span>
    </Link>
  );
}

/** «الكل · 12»: plain spaces around the dot, as the mockup sets it */
const Count = ({ n }: { n: number }) => <>{" "}<span aria-hidden>·</span>{" "}{n}</>;

/** the capsule-less flag filters, cleared when a status capsule is picked */
const NO_FLAGS = { review: undefined, decision: undefined } as const;

export function FilterChips({ sp, counts }: { sp: ListParams; counts: Counts }) {
  const statuses = (Object.keys(CASE_STATUS) as (keyof typeof CASE_STATUS)[]).filter((k) => counts.status[k] > 0 || sp.status === k);
  const stage = sp.stage ? STAGE[sp.stage as keyof typeof STAGE] : null;
  return (
    // py-1.5 keeps the capsules' 44px tap areas inside the scroll box (it would clip them). Phones: 16px + 6px puts
    // the visible capsule where it was drawn; desktop: 28px + 6px = the mockup's 34px, and -mb gives the 6px back.
    <nav aria-label="تصفية القضايا" className="no-scrollbar mt-4 flex items-center gap-0.5 overflow-x-auto py-1.5 sm:-mb-1.5 sm:mt-7 sm:gap-1 sm:px-1">
      {/* owner decision: the active filter's clear pill comes first (at the right), so it is never scrolled out of view */}
      {sp.decision ? <ClearPill label="محتاجة قرار" to={casesHref(sp, { decision: undefined })} /> : null}
      {sp.review ? <ClearPill label="محتاجة مراجعة" to={casesHref(sp, { review: undefined })} /> : null}
      {stage ? <ClearPill label={stage} to={casesHref(sp, { stage: undefined })} /> : null}
      {sp.q ? <ClearPill label={`«${sp.q}»`} to={casesHref(sp, { q: undefined })} /> : null}
      <Capsule on={!sp.status && !sp.review && !sp.decision} to={casesHref(sp, { status: undefined, ...NO_FLAGS })}>الكل<Count n={counts.total} /></Capsule>
      {statuses.map((k) => (
        <Capsule key={k} on={sp.status === k} to={casesHref(sp, { status: k, ...NO_FLAGS })}>
          {SHORT[k] ? <><span className="sm:hidden">{SHORT[k]}</span><span className="hidden sm:inline">{CASE_STATUS[k]}</span></> : CASE_STATUS[k]}
          <Count n={counts.status[k]} />
        </Capsule>
      ))}
    </nav>
  );
}

/** an active filter without a capsule of its own (?decision=, ?review=, ?stage=, ?q=): shown with an × that removes it */
function ClearPill({ label, to }: { label: string; to: string }) {
  return (
    <Link href={to} aria-label={`شيل التصفية ${label}`} className="tap group inline-flex shrink-0 items-center pe-1">
      <span className="inline-flex h-8 max-w-[220px] items-center gap-1.5 rounded-full border border-border px-3 text-sm font-semibold text-text sm:h-chip">
        <span className="truncate">{label}</span>
        <X size={14} strokeWidth={2.2} aria-hidden className="shrink-0 text-text-4 group-hover:text-text" />
      </span>
    </Link>
  );
}
