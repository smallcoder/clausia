// The case page header (docs/design/*Case.dc.html), v2: who first — «موكلنا», the client's name big, «ضد <opponent>».
// Desktop (item 19): row 1 = back · breadcrumb «القضايا / <number>» … status chip, then «…» at the far end (owner:
// it holds the moved links — case data, hearings, case chat, JSON); row 2 = eyebrow
// + the name with «ضد <opponent>» on the same line; row 3 = one solid card of 7 cells split by hairlines (it wraps by the width of its column, see below) — number,
// court, circuit, type | facts, docs, needs review (big light numbers, gold only when > 0).
// Mobile: back + «…» floating, eyebrow + status, the name, «ضد» below, then a 2×2 solid spec card, no stats (the tabs
// and the banner carry them). Sizes follow the mockups to the pixel. Text the mockups leave at `line-height: normal`
// gets 1.35 (SF Arabic's normal in the mockup render).
// Sub-views (?tab=…) get a short header: on desktop the breadcrumb and the shared title row (CaseSubHeader); on mobile
// the case's who-line as eyebrow and the view name as title.
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BackBtn, two, type HeroStat } from "@/components/shell/PageHero";
import { PageTitle, TitleRow, TitleStats, type TitleStatData } from "@/components/shell/TitleRow";
import type { CaseFile } from "@/lib/case-file";
import type { PendingEdits } from "@/lib/edits";
import { CASE_STATUS } from "@/lib/labels";
import { CaseMenu } from "./CaseMenu";
import { AskTarget } from "./AskTarget";
import { Change, SuggestedTag, Was } from "./Suggest";
import { specSheet, statusTone, whoLine } from "./case-view";

const TONE = { good: ["bg-good", "text-good"], warn: ["bg-gold", "text-gold"], neutral: ["bg-text-4", "text-text-3"] } as const;

/** Mockup: 28px outlined pill (content box, so 30px with its hairline), 6px dot, 12.5px semibold word. */
function StatusPill({ status }: { status: string }) {
  const [dot, text] = TONE[statusTone(status)];
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
      <span className="gold-wash rounded-full"><StatusPill status={proposed} /></span>
      <SuggestedTag />
    </span>
  );
}

/** Mobile mockup: 42px round glass buttons. */
const ROUND = "tap glass glass-icon inline-flex size-control-lg shrink-0 items-center justify-center rounded-full";

/** Desktop mockup card, stats part: 0 24px each, a hairline on the start side except the first; 32px light number,
 *  11.5px label 7px below (a 5px gold dot when it needs action). Gold only when the count is above zero. */
const STAT_FIELD: Record<string, string> = { "وقائع": "facts", "مستندات": "documents", "محتاجة مراجعة": "review" };
function StatCell({ s, first, caseId }: { s: HeroStat; first: boolean; caseId: string }) {
  const gold = s.highlight && Number(s.value) > 0;
  const body = (
    <>
      <div className={`stat-num text-xl tracking-normal ${gold ? "text-gold" : "text-title"}`}>{typeof s.value === "number" ? two(s.value) : s.value}</div>
      <div className={`mt-1.75 flex items-center gap-1.25 text-xs leading-4 ${gold ? "text-gold" : "text-text-3"}`}>
        {gold ? <span aria-hidden className="size-dot rounded-full bg-gold" /> : null}{s.label}
      </div>
    </>
  );
  const cls = `block min-w-0 px-6 ${first ? "" : "border-s border-border-2"}`;
  const ask = { kind: "field" as const, id: caseId, field: STAT_FIELD[s.label] ?? "stat", label: `${s.label} · ${s.value}` };
  // «اسأل Clausia» sits beside the link (not inside it)
  if (!s.href) return <AskTarget item={ask} className="min-w-0"><div className={cls}>{body}</div></AskTarget>;
  // a same-page hash (e.g. #item-…) must fire hashchange so the item sheet opens: plain <a>
  return (
    <AskTarget item={ask} className="min-w-0">
      {s.href.includes("#")
        ? <a href={s.href} className={`${cls} transition hover:opacity-80`}>{body}</a>
        : <Link href={s.href} className={`${cls} transition hover:opacity-80`}>{body}</Link>}
    </AskTarget>
  );
}

const SPEC_FIELD = ["case_number", "court", "circuit", "case_type"];

export function CaseHeader({ cf, caseId, stats, edits }: { cf: CaseFile; caseId: string; stats: HeroStat[]; edits?: PendingEdits }) {
  const who = whoLine(cf);
  const spec = specSheet(cf);
  // fields the chat proposed to change: the cell keeps today's value struck and shows the new one in gold
  const patch = edits?.casePatch;
  const after = patch ? specSheet({ ...cf, case: { ...cf.case, ...(patch as Partial<CaseFile["case"]>) } }) : null;
  const changed = (i: number) => !!after && (after[i].value !== spec[i].value || after[i].extra !== spec[i].extra);
  const proposedStatus = patch?.status && patch.status !== cf.case.status ? patch.status : null;
  const full = (s: (typeof spec)[number]) => (s.value ? `${s.value}${s.extra ? ` · ${s.extra}` : ""}` : null);
  const number = spec[0].value;
  /** «اسأل Clausia» on a spec cell: the case's field and what it says now */
  const askOf = (i: number) => ({ kind: "field" as const, id: caseId, field: SPEC_FIELD[i], label: `${spec[i].label} · ${full(spec[i]) ?? "غير مسجل"}` });
  const empty = (fem?: boolean) => (fem ? "مش متسجلة" : "مش متسجل");
  return (
    <header className="leading-[1.35]">
      {/* mobile: back + more at 14px from the top and the sides */}
      <div className="-mx-0.5 flex items-center justify-between pt-3.5 sm:hidden">
        <Link href="/cases" aria-label="رجوع" className={ROUND}><ChevronRight size={20} strokeWidth={2} aria-hidden /></Link>
        <CaseMenu caseId={caseId} align="end" className="size-control-lg" />
      </div>

      {/* desktop row 1: 40px back · breadcrumb … status chip · «…» (owner decision: «…» next to the chip) */}
      <div className="hidden items-center gap-3 px-2 pt-6 sm:flex">
        <Link href="/cases" aria-label="رجوع" className={`${ROUND} sm:size-10`}><ChevronRight size={20} strokeWidth={2.2} aria-hidden /></Link>
        <nav aria-label="المسار" className="min-w-0 flex-1 truncate text-sm text-text-3">
          <Link href="/cases" className="tap hover:text-text hover:underline">القضايا</Link>
          {number ? <><span aria-hidden className="mx-1.5 text-text-4">/</span><span className="font-semibold text-text">{number}</span></> : null}
        </nav>
        <StatusSlot status={cf.case.status} proposed={proposedStatus} />
        <CaseMenu caseId={caseId} align="end" className="size-10" />
      </div>

      {/* who: mobile = eyebrow + status, name, «ضد» below; desktop = eyebrow, then name + «ضد» on one line */}
      <div className="px-1 pt-4.5 sm:mt-5.5 sm:px-2 sm:pt-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gold">{who.client ? "موكلنا" : "القضية"}</span>
          <span className="sm:hidden"><StatusSlot status={cf.case.status} proposed={proposedStatus} /></span>
        </div>
        <h1 className="mt-1.5 text-xl font-bold leading-[1.2] text-title sm:mt-1 sm:text-2xl sm:leading-[1.15]">
          {who.client ?? who.fallback}
          {who.opponent ? <span className="max-sm:hidden"><span className="ms-2.5 text-lg font-normal text-text-4">ضد</span> <span className="text-xl font-medium text-text">{who.opponent}</span></span> : null}
        </h1>
        {who.opponent ? <p className="mt-0.75 text-md text-text sm:hidden"><span className="text-text-4">ضد</span> {who.opponent}</p> : null}
      </div>

      {/* below lg: the 2×2 spec card (mobile mockup) */}
      <dl className="mt-4 grid grid-cols-2 overflow-hidden rounded-lg border border-border-2 bg-card shadow-card lg:hidden">
        {spec.map((s, i) => (
          <AskTarget key={s.label} inside item={askOf(i)} className={`min-w-0 border-border-2 px-3.5 py-3 ${i % 2 === 0 ? "border-e" : ""} ${i >= 2 ? "border-t" : ""} ${changed(i) ? "gold-wash" : ""}`}>
            <dt className={changed(i) ? "flex items-center gap-1.5 text-xs text-gold" : "text-xs text-text-4"}>{s.short}{changed(i) ? <SuggestedTag /> : null}</dt>
            {/* long court / type names stay one line with «…», the full name in the tooltip (owner decision) */}
            <dd title={s.clip && s.value ? s.value : undefined}
              className={`mt-1 text-base leading-[1.4] ${s.clip ? "truncate" : ""} ${s.value ? "font-semibold text-text" : "text-text-4"}`}>
              {changed(i) && after ? <Change old={s.value ? s.mobile ?? s.value : null} next={after[i].mobile ?? after[i].value ?? empty(s.fem)} /> : s.value ? s.mobile ?? s.value : empty(s.fem)}
            </dd>
          </AskTarget>
        ))}
      </dl>

      {/* lg+: one card of 7 cells. It follows the width of its own column (the page column is narrower than the screen now: the
          chat panel sits beside it): ≥1280 wide — one row, 4 spec cells | hairline | 3 stats; ≥768 — the 4 spec cells over the 3 stats;
          narrower — the spec cells 2 × 2, then the stats. Nothing scrolls sideways and no text is clipped. */}
      <div className="@container mt-5.5 hidden lg:block">
        <div className="grid grid-cols-2 gap-y-4 rounded-xl border border-border-2 bg-card py-5 shadow-card @3xl:grid-cols-4 @3xl:gap-y-0 @7xl:grid-cols-[repeat(4,minmax(0,1fr))_1px_repeat(3,minmax(0,0.7fr))] @7xl:items-stretch">
          <dl className="contents">
            {spec.map((s, i) => (
              <AskTarget key={s.label} item={askOf(i)} className={`min-w-0 px-6 ${i % 2 ? "border-s border-border-2" : ""} ${i >= 2 ? "border-t border-border-2 pt-4" : ""} @3xl:border-t-0 @3xl:pt-0 ${i > 0 ? "@3xl:border-s @3xl:border-border-2" : ""} ${changed(i) ? "gold-wash rounded-lg py-3" : ""}`}>
                <dt className={changed(i) ? "flex items-center gap-1.5 text-xs leading-4 text-gold" : "text-xs leading-4 text-text-4"}>{s.label}{changed(i) ? <SuggestedTag /> : null}</dt>
                <dd className={`mt-1.75 text-md leading-[1.4] ${s.value ? "font-semibold text-text" : "text-text-4"}`}>
                  {changed(i) && after ? <Change old={full(s)} next={full(after[i]) ?? empty(s.fem)} /> : <>{s.value ?? empty(s.fem)}{s.value && s.extra ? ` · ${s.extra}` : null}</>}
                </dd>
              </AskTarget>
            ))}
          </dl>
          <div aria-hidden className="-my-1 hidden bg-border-2 @7xl:block" />
          <div className="col-span-full grid grid-cols-3 border-t border-border-2 pt-4 @7xl:contents">
            {stats.map((s, i) => <StatCell key={s.label} s={s} first={i === 0} caseId={caseId} />)}
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * The sub-views' header (documents, hearings, details). Desktop: the breadcrumb row on top (back · «القضايا / <number>
 * / <view>»), then the title row of the list pages (shell/TitleRow): the title (34px), the view's count inline, and
 * `action` (documents: «ارفع مستند») at the far end, with the hairline under it. Mobile (unchanged): back, the
 * who-line as eyebrow, the view name as title.
 */
export function CaseSubHeader({ cf, caseId, crumb, title, stats = [], action, eyebrow = false }: {
  cf: CaseFile; caseId: string;
  /** the view's short name, last in the breadcrumb */
  crumb: string;
  title: string;
  stats?: TitleStatData[];
  action?: ReactNode;
  /** desktop: the who-line «عادل النموذجي ضد وليد التجريبي» above the title, as the documents table mockup draws it (the phone always has it) */
  eyebrow?: boolean;
}) {
  const who = whoLine(cf);
  const number = specSheet(cf)[0].value;
  return (
    <header>
      <div className="flex items-start gap-3 pt-2 sm:hidden">
        <BackBtn href={`/cases/${caseId}`} />
        <div className="min-w-0 pt-0.5">
          <Link href={`/cases/${caseId}`} className="text-sm font-semibold text-text-3 hover:text-text">
            {who.client ?? who.fallback}{who.client && who.opponent ? <span className="text-text-4"> ضد </span> : null}{who.client && who.opponent ? who.opponent : null}
          </Link>
          <h1 className="mt-1 text-xl font-bold leading-[1.2] text-title">{crumb}</h1>
        </div>
      </div>

      {/* desktop row 1: as the case page's own (40px back · breadcrumb), the view's name last */}
      <div className="hidden items-center gap-3 px-2 pt-6 sm:flex">
        <Link href={`/cases/${caseId}`} aria-label="رجوع" className={`${ROUND} sm:size-10`}><ChevronRight size={20} strokeWidth={2.2} aria-hidden /></Link>
        <nav aria-label="المسار" className="min-w-0 flex-1 truncate text-sm text-text-3">
          <Link href="/cases" className="tap hover:text-text hover:underline">القضايا</Link>
          {number ? <><span aria-hidden className="mx-1.5 text-text-4">/</span><Link href={`/cases/${caseId}`} className="tap hover:text-text hover:underline">{number}</Link></> : null}
          <span aria-hidden className="mx-1.5 text-text-4">/</span><span aria-current="page" className="font-semibold text-text">{crumb}</span>
        </nav>
      </div>
      {eyebrow ? (
        <p className="hidden px-2 text-sm font-semibold text-gold sm:-mb-4 sm:mt-3 sm:block">
          {who.client ?? who.fallback}{who.client && who.opponent ? <span> ضد </span> : null}{who.client && who.opponent ? who.opponent : null}
        </p>
      ) : null}
      {/* desktop row 2: the title row */}
      <TitleRow as="div" top="sub" className="hidden">
        <PageTitle>{title}</PageTitle>
        <TitleStats stats={stats} mobile={false} />
        {action ? <div className="sm:ms-auto">{action}</div> : null}
      </TitleRow>
    </header>
  );
}
