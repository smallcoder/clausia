// The case page's default view (docs/design/{Light,Dark}{,Mobile}Case.dc.html, v2), built from getCaseFile.
// Desktop: main column (Clausia summary, facts timeline, لنا/ضدنا, judgments) + side column (next hearing,
// parties, documents), all solid cards. Mobile: one column in the mobile mockup's order — the two columns become
// `display: contents` and `order-*` sorts them — with Facts / Docs / Parties as tabs (CaseTabs).
// Rows show no edit links: tapping an item opens its actions (confirm / reject / edit) in the sheet (ItemSheet).
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SegBar, Seg, TabScope } from "@/components/cases/CaseTabs";
import { SheetEditText, SheetReview, TapItem } from "@/components/cases/ItemSheet";
import { pagesLabel } from "@/components/documents/DocThumb";
import { StatusChip } from "@/components/shell/PageHero";
import type { CaseFile } from "@/lib/case-file";
import { formatDayLabel, formatDmy } from "@/lib/dates";
import { JUDGMENT_KIND } from "@/lib/labels";
import {
  MONTHS, READ_SHORT, agoLabel, daysBetween, docName, factDate, partyRows, pendingHref, pendingWords, shortDmy, sourceText,
  summarySegments, untilLabel, type HearingState,
} from "@/components/cases/case-view";

type Fact = CaseFile["facts"][number];
type Req = CaseFile["requests"][number];
type Arg = CaseFile["arguments"][number];
type Party = CaseFile["parties"][number];
type Judgment = CaseFile["judgments"][number];

const REQUEST_KIND: Record<string, string> = { primary: "طلب أصلي", alternative: "طلب احتياطي", precautionary: "طلب تحفظي" };
const ARG_KIND: Record<string, string> = { formal_defense: "دفع شكلي", substantive_defense: "دفع موضوعي", argument: "دفاع" };
const OUTCOME: Record<string, { label: string; tone: "good" | "bad" | "neutral" }> = {
  for_us: { label: "لصالحنا", tone: "good" }, against_us: { label: "ضدنا", tone: "bad" }, partial: { label: "لصالحنا جزئيًا", tone: "neutral" },
};

/** Solid content card (mockup: 24–26px radius, hairline, deep soft shadow). */
const CARD = "rounded-[24px] border border-border-2 bg-card shadow-card lg:rounded-[26px]";

/** «مقترحة · راجعها»: a 5px gold dot + 11px gold word (needs the lawyer's action). */
const Suggested = ({ label = "مقترحة · راجعها" }: { label?: string }) => (
  <span className="inline-flex items-center gap-[5px] text-[11px] font-semibold text-gold"><span aria-hidden className="size-[5px] rounded-full bg-gold" />{label}</span>
);

/** The Clausia «C» mark (mockup: 32px / 11px radius / 15px on desktop, 26px / 9px / 12px on mobile; a hairline + inner light in dark). */
const MARK = "mark font-num inline-flex shrink-0 items-center justify-center font-extrabold size-[26px] rounded-[9px] text-[12px] lg:size-8 lg:rounded-[11px] lg:text-[15px] dark:border dark:border-white/8 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]";

function pendingOf<T>(cf: CaseFile, table: string): T[] {
  return cf.pending_suggestions.filter((p) => p.table === table).map((p) => p.item as T);
}

/** Source + quote block inside a sheet. Quoted court / document text is verbatim, in Naskh. */
function SheetSource({ cf, item }: { cf: CaseFile; item: { review_status: string; created_by: string; source: CaseFile["facts"][number]["source"] } }) {
  return (
    <div className="space-y-1.5 rounded-2xl bg-card-2 px-4 py-3 text-[13px] text-text-3">
      <p>{sourceText(item.source, cf.documents)} · {item.review_status === "suggested" ? "مقترحة، لسه ما اتأكدتش" : "مؤكدة"} · {item.created_by === "model" ? "صاغها Clausia" : "كتبها المحامي"}</p>
      {item.source.quote ? <p className="text-doc text-[14px] text-text-2">«{item.source.quote}»</p> : null}
      {item.source.document_id ? <a href={`/api/documents/${item.source.document_id}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center font-semibold text-text-2 underline-offset-4 hover:underline">فتح المستند</a> : null}
    </div>
  );
}

// ---------- Summary + review banner ----------

/**
 * Desktop: «ملخص Clausia» + the full templated summary (hearing, review in gold). Mobile: no label and only the case's
 * own summary sentence (the hearing card and the review banner carry the rest); without one, the full summary.
 */
function Summary({ cf, hs, today, className }: { cf: CaseFile; hs: HearingState; today: string; className: string }) {
  const segs = summarySegments(cf, hs, today).map((s, i) => s.gold ? <span key={i} className="font-semibold text-gold">{s.text}</span> : <span key={i}>{s.text}</span>);
  const own = cf.case.summary?.trim();
  return (
    <div className={`flex items-start gap-2.5 px-1 lg:gap-3.5 lg:px-2 ${className}`}>
      <span aria-hidden className={MARK}>C</span>
      <div className="min-w-0 flex-1">
        <div className="hidden text-[12px] font-semibold text-gold lg:block">ملخص Clausia</div>
        <p className="mt-0.5 text-[14.5px] leading-[1.8] text-text lg:hidden">{own ? (/[.!؟]$/u.test(own) ? own : `${own}.`) : segs}</p>
        <p className="mt-1 hidden text-[17px] leading-[1.85] text-text lg:block">{segs}</p>
      </div>
    </div>
  );
}

/** Mobile only (the desktop mockup carries the review in the summary's gold words and the gold stat). */
function ReviewBanner({ cf, hs, caseId, className }: { cf: CaseFile; hs: HearingState; caseId: string; className: string }) {
  // `hash`: a same-page #item-… link is a plain <a> so the browser fires hashchange (opens the sheet, switches the tab)
  const rows: { key: string; href: string; gold: string; rest: string; hash?: boolean }[] = [];
  const words = pendingWords(cf);
  if (words) rows.push({ key: "p", href: `/cases/${caseId}${pendingHref(cf) ?? ""}`, gold: words, rest: cf.pending_suggestions.length === 1 ? "محتاجة مراجعتك" : "محتاجين مراجعتك", hash: pendingHref(cf)?.startsWith("#") });
  if (hs.undecided) rows.push({ key: "h", href: `/cases/${caseId}?tab=hearings#h-${hs.undecided.id}`, gold: `جلسة ${shortDmy(hs.undecided.date)}`, rest: "محتاجة قرار" });
  if (!rows.length) return null;
  return (
    <div className={`space-y-2 lg:hidden ${className}`}>
      {rows.map((r) => {
        const cls = "flex min-h-11 items-center gap-2.5 rounded-[18px] border border-[var(--accent-edge)] px-3.5 py-3 text-[13.5px] text-text";
        const body = (
          <>
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-gold" />
            <span className="min-w-0 flex-1"><span className="font-semibold text-gold">{r.gold}</span> {r.rest}</span>
            <ChevronLeft aria-hidden size={18} strokeWidth={2} className="shrink-0 text-gold" />
          </>
        );
        return r.hash ? <a key={r.key} href={r.href} className={cls}>{body}</a> : <Link key={r.key} href={r.href} className={cls}>{body}</Link>;
      })}
    </div>
  );
}

// ---------- Facts ----------

function FactRow({ f, last, cf }: { f: Fact; last: boolean; cf: CaseFile }) {
  const suggested = f.review_status === "suggested";
  const dated = f.date && f.date_precision !== "unknown";
  return (
    <span className="flex gap-3.5">
      <span className={`font-num w-16 shrink-0 pt-1 text-[12.5px] font-semibold lg:w-[78px] ${dated ? "text-text" : "text-text-4"}`}>
        <span className={f.date_precision === "day" ? "num" : ""}>{factDate(f.date, f.date_precision)}</span>
      </span>
      <span className="flex w-[9px] shrink-0 flex-col items-center" aria-hidden>
        <span className={`mt-[9px] size-[7px] shrink-0 rounded-full ${suggested ? "bg-gold" : "bg-text-3"}`} />
        {!last ? <span className="mt-1 w-px flex-1 bg-[var(--hairline-v2)]" /> : null}
      </span>
      <span className="min-w-0 flex-1 pb-[18px]">
        <span className="text-doc block text-[15px] text-text lg:text-[16px]" style={{ lineHeight: 1.9 }}>{f.text}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-text-4">{sourceText(f.source, cf.documents)}{suggested ? "" : " · مؤكدة"}</span>
          {suggested ? <Suggested /> : null}
        </span>
      </span>
    </span>
  );
}

function Facts({ cf, caseId }: { cf: CaseFile; caseId: string }) {
  const all = [...cf.facts, ...pendingOf<Fact>(cf, "case_facts")].sort((a, b) => {
    const da = a.date && a.date_precision !== "unknown" ? a.date : null;
    const db = b.date && b.date_precision !== "unknown" ? b.date : null;
    if (da === db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da < db ? -1 : 1;
  });
  const c = cf.case;
  const fd = c.facts_date && c.facts_date_precision !== "unknown" ? formatDmy(c.facts_date, c.facts_date_precision) : null;
  return (
    <section id="facts" className={`scroll-mt-24 ${CARD} rounded-[26px]`} aria-label="الوقائع">
      <div className="flex items-baseline justify-between gap-3 px-[18px] pt-4 lg:px-6 lg:pb-1.5 lg:pt-[18px]">
        <h2 className="hidden text-[17px] font-bold text-title lg:block">الوقائع</h2>
        <span className="text-[11.5px] text-text-4">تاريخ الوقائع {fd ? <span className="num font-num">{fd}</span> : "مش محدد"} · بيحدد نسخة القانون</span>
      </div>
      {all.length ? (
        <div className="px-3 pb-1.5 pt-2.5 lg:px-4">
          {all.map((f, i) => (
            <TapItem key={f.id} id={f.id} title="واقعة" tight className="rounded-2xl px-1.5 lg:px-2" row={<FactRow f={f} last={i === all.length - 1} cf={cf} />}>
              <p className="font-num text-[13px] font-bold text-title">{factDate(f.date, f.date_precision)}{f.date_text && f.date_text !== factDate(f.date, f.date_precision) ? <span className="font-sans font-normal text-text-4"> · «{f.date_text}»</span> : null}</p>
              <p className="text-doc text-[17px] text-text">{f.text}</p>
              <SheetSource cf={cf} item={f} />
              {f.review_status === "suggested" ? <SheetReview table="case_facts" id={f.id} caseId={caseId} /> : null}
              <SheetEditText table="case_facts" id={f.id} caseId={caseId} initial={f.text} />
            </TapItem>
          ))}
        </div>
      ) : (
        <p className="px-[18px] pb-5 pt-3 text-[14px] leading-7 text-text-3 lg:px-6">لسه مفيش وقائع. احكي لـ Clausia اللي حصل وتواريخه، أو ارفع صحيفة الدعوى.</p>
      )}
    </section>
  );
}

// ---------- لنا / ضدنا ----------

function TextItem({ cf, caseId, table, item, kindLabel }: { cf: CaseFile; caseId: string; table: "case_requests" | "case_arguments"; item: Req | Arg; kindLabel: string | null }) {
  const suggested = item.review_status === "suggested";
  return (
    <TapItem id={item.id} title={table === "case_requests" ? "طلب" : "دفع / دفاع"} tight className="-mx-2 mt-1.5 rounded-xl px-2 lg:mt-2"
      row={<span className="block text-[14px] leading-[1.7] text-text">{item.text}{suggested ? <span className="ms-2 inline-block"><Suggested /></span> : null}</span>}>
      {kindLabel ? <p className="text-[13px] font-bold text-text-3">{kindLabel}</p> : null}
      <p className="text-doc text-[17px] text-text">{item.text}</p>
      <SheetSource cf={cf} item={item} />
      {suggested ? <SheetReview table={table} id={item.id} caseId={caseId} /> : null}
      <SheetEditText table={table} id={item.id} caseId={caseId} initial={item.text} />
    </TapItem>
  );
}

/** Mockup: dot (5px mobile / 6px desktop) + 11.5px / 12px semibold word, 6px apart. */
function SideLabel({ tone, children }: { tone: "good" | "bad"; children: ReactNode }) {
  return (
    <h2 className={`flex items-center gap-1.5 text-[11.5px] font-semibold lg:text-[12px] ${tone === "good" ? "text-good" : "text-bad"}`}>
      <span aria-hidden className={`size-[5px] rounded-full lg:size-1.5 ${tone === "good" ? "bg-good" : "bg-bad"}`} />{children}
    </h2>
  );
}

function Sides({ cf, caseId, className }: { cf: CaseFile; caseId: string; className: string }) {
  const requests = [...cf.requests, ...pendingOf<Req>(cf, "case_requests")];
  const args = [...cf.arguments, ...pendingOf<Arg>(cf, "case_arguments")];
  const ours = args.filter((a) => a.side === "ours");
  const theirs = args.filter((a) => a.side === "opponent");
  // mobile: one card (4px 18px) with the two halves split by a hairline; desktop: two equal-height cards 14px apart
  const card = "lg:flex-1 lg:rounded-[24px] lg:border lg:border-border-2 lg:bg-card lg:px-[22px] lg:py-[18px] lg:shadow-card";
  const empty = (t: string) => <p className="mt-1.5 text-[13.5px] leading-[1.7] text-text-4 lg:mt-2">{t}</p>;
  return (
    <div className={`${CARD} px-[18px] py-1 lg:flex lg:gap-3.5 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none ${className}`}>
      <section className={`border-b border-[var(--hairline-v2)] pb-3 pt-3.5 lg:border-b-0 ${card}`}>
        <SideLabel tone="good">لنا · طلباتنا</SideLabel>
        <div>
          {requests.map((r) => <TextItem key={r.id} cf={cf} caseId={caseId} table="case_requests" item={r} kindLabel={r.kind ? REQUEST_KIND[r.kind] ?? r.kind : null} />)}
          {ours.map((a) => <TextItem key={a.id} cf={cf} caseId={caseId} table="case_arguments" item={a} kindLabel={`دفاعنا${a.kind ? ` · ${ARG_KIND[a.kind] ?? a.kind}` : ""}`} />)}
          {!requests.length && !ours.length ? empty("لسه مفيش طلبات متسجلة.") : null}
        </div>
      </section>
      <section className={`py-3.5 ${card}`}>
        <SideLabel tone="bad">ضدنا · دفوع الخصم</SideLabel>
        <div>
          {theirs.map((a) => <TextItem key={a.id} cf={cf} caseId={caseId} table="case_arguments" item={a} kindLabel={a.kind ? ARG_KIND[a.kind] ?? a.kind : null} />)}
          {!theirs.length ? empty("لسه مفيش دفوع للخصم متسجلة.") : null}
        </div>
      </section>
    </div>
  );
}

// ---------- Judgments ----------

function Judgments({ cf, caseId, className }: { cf: CaseFile; caseId: string; className: string }) {
  const rows = [...cf.judgments, ...pendingOf<Judgment>(cf, "judgments")].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  if (!rows.length) return null;
  return (
    <section className={`${CARD} ${className}`} aria-label="الأحكام">
      <h2 className="px-[18px] pt-4 text-[17px] font-bold text-title lg:px-6 lg:pt-[18px]">الأحكام</h2>
      <ul className="divide-y divide-border-2">
        {rows.map((j) => {
          const outcome = j.outcome ? OUTCOME[j.outcome] : null;
          const suggested = j.review_status === "suggested";
          return (
            <li key={j.id} id={`item-${j.id}`} className="scroll-mt-24 space-y-3 px-[18px] py-4 lg:px-6">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[15px] font-bold text-text">{j.date ? <>حكم <span className="num font-num">{formatDmy(j.date)}</span></> : "حكم (التاريخ مش متسجل)"}</span>
                <StatusChip tone="neutral">{JUDGMENT_KIND[j.kind as keyof typeof JUDGMENT_KIND] ?? j.kind}</StatusChip>
                {outcome ? <StatusChip tone={outcome.tone}>{outcome.label}</StatusChip> : null}
                {suggested ? <Suggested /> : null}
              </div>
              <div className="rounded-2xl bg-card-2 px-4 py-3">
                <p className="text-xs text-text-4">المنطوق</p>
                <p className="text-doc mt-1 text-[16px] text-text">{j.operative_text}</p>
              </div>
              <p className="text-[13.5px] text-text-2">
                {j.appeal_deadline ? <>آخر ميعاد للطعن: <span className="num font-num font-bold">{formatDmy(j.appeal_deadline)}</span> <span className="text-text-4">· كما ذكره المحامي</span>{j.appeal_deadline_note ? <span className="mt-1 block text-text-4">{j.appeal_deadline_note}</span> : null}</>
                  : <span className="text-text-4">ميعاد الطعن مش متسجل. Clausia مش بيحسبه؛ قوله لـ Clausia لو عايز تسجله.</span>}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-text-4">{sourceText(j.source, cf.documents)}</span>
                {suggested ? <div className="w-full sm:w-64"><SheetReview table="judgments" id={j.id} caseId={caseId} /></div> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------- Side column ----------

/** Big light day + month, then the hearing's lines (mockup: next-hearing card). */
function DayBlock({ iso }: { iso: string }) {
  const [, m, d] = iso.split("-").map(Number);
  return (
    <div className="w-11 shrink-0 text-center leading-none lg:w-auto lg:min-w-12">
      <div className="stat-num text-[44px] text-title lg:text-[58px] lg:tracking-[-0.04em]" style={{ fontWeight: 200 }}>{d}</div>
      <div className="mt-1 text-[11px] text-text-3 lg:mt-1.5 lg:text-[12px]">{MONTHS[m - 1]}</div>
    </div>
  );
}

function HearingCard({ cf, hs, today, caseId, className }: { cf: CaseFile; hs: HearingState; today: string; caseId: string; className: string }) {
  const circuit = cf.case.circuit;
  const all = <Link href={`/cases/${caseId}?tab=hearings`} className="-my-3 inline-flex min-h-11 shrink-0 items-center text-[12px] text-text-3 hover:text-text hover:underline">الجلسات ←</Link>;
  const h = hs.next ?? hs.undecided;
  if (!h) {
    return (
      <div className={`${CARD} flex items-center justify-between gap-3 px-[18px] py-4 lg:p-[22px] ${className}`}>
        <div>
          <p className="text-[15px] font-bold text-text">مفيش جلسة جاية متسجلة</p>
          <p className="mt-0.5 text-[12.5px] text-text-3">لما يتحدد ميعاد، قوله لـ Clausia.</p>
        </div>
        {all}
      </div>
    );
  }
  const upcoming = h === hs.next;
  const [y, m, d] = h.date.split("-").map(Number);
  const weekday = formatDayLabel(h.date).split(" ")[0];
  const needed = upcoming ? hs.nextNeeded : hs.undecidedNeeded;
  const when = upcoming ? `الجلسة الجاية · ${untilLabel(daysBetween(today, h.date))}` : `آخر جلسة · ${agoLabel(daysBetween(h.date, today))}`;
  const decide = !upcoming ? (
    <Link href={`/cases/${caseId}?tab=hearings#h-${h.id}`} className="relative -my-3 inline-flex min-h-11 items-center gap-2 text-[13px] font-semibold text-gold hover:underline">
      <span aria-hidden className="size-1.5 rounded-full bg-gold" />محتاجة قرار · سجّله
    </Link>
  ) : null;
  // the mockup draws no «الجلسات ←» link: the whole card opens the hearings view (an overlay link, so the
  // «سجّله» link inside stays a separate, non-nested target)
  return (
    <div className={`${CARD} relative px-[18px] py-4 transition-colors hover:bg-card-2/40 lg:p-[22px] ${className}`}>
      <Link href={`/cases/${caseId}?tab=hearings`} aria-label="الجلسات" className="absolute inset-0 rounded-[inherit]" />
      <div className="flex items-center gap-4 lg:gap-[18px]">
        <DayBlock iso={h.date} />
        <div className="min-w-0 flex-1 border-s border-[var(--hairline-v2)] ps-4 lg:ps-[18px]">
          <div className="text-[11.5px] text-text-3 lg:text-[12px]">{when}</div>
          <div className="mt-[3px] text-[15px] font-bold text-text lg:mt-1 lg:text-[16px]">
            {weekday} <span className="num font-num lg:hidden">{d}/{m}</span><span className="num font-num hidden lg:inline">{d}/{m}/{y}</span>
            {circuit ? <span className="lg:hidden"> · {circuit}</span> : null}
          </div>
          {circuit ? <div className="mt-0.5 hidden text-[12.5px] text-text-3 lg:block">{circuit}</div> : null}
          {needed ? (
            <div className="mt-1 flex items-center gap-1.5 text-[12.5px] text-text lg:hidden">
              <span aria-hidden className={`size-[5px] shrink-0 rounded-full ${upcoming ? "bg-gold" : "bg-text-4"}`} />
              <span className="min-w-0">{upcoming ? "" : "كان المطلوب: "}{needed}</span>
            </div>
          ) : null}
          {decide ? <div className="mt-1.5 lg:hidden">{decide}</div> : null}
        </div>
      </div>
      {needed || decide ? (
        <div className="mt-[18px] hidden space-y-2 border-t border-[var(--hairline-v2)] pt-3.5 lg:block">
          {needed ? (
            <div className="flex items-center gap-2 text-[13.5px]">
              <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${upcoming ? "bg-gold" : "bg-text-4"}`} />
              <span className="text-text-3">{upcoming ? "المطلوب:" : "كان المطلوب:"}</span>
              <span className="font-semibold text-text">{needed}</span>
            </div>
          ) : null}
          {decide}
        </div>
      ) : null}
    </div>
  );
}

function ListCard({ title, end, children, className = "" }: { title?: string; end?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${CARD} px-[18px] py-1.5 lg:px-[22px] ${className}`} aria-label={title}>
      {title ? (
        <div className="hidden items-center justify-between pb-1.5 pt-3.5 lg:flex">
          <h2 className="text-[14px] font-bold text-text">{title}</h2>
          {end}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function Parties({ cf, caseId }: { cf: CaseFile; caseId: string }) {
  const rows = partyRows(cf.parties, pendingOf<Party>(cf, "case_parties"));
  const line = (name: string, role: string, extra?: ReactNode) => (
    <span className="block py-3">
      <span className="flex items-center gap-2">
        <span className="min-w-0 truncate text-[14px] font-semibold text-text">{name}</span>
        {extra}
      </span>
      <span className="mt-0.5 block text-[11.5px] text-text-3">{role}</span>
    </span>
  );
  return (
    <ListCard title="الأطراف">
      {rows.length ? (
        <div className="lg:[&>*]:border-t [&>*+*]:border-t [&>*]:border-[var(--hairline-v2)]">
          {rows.map((r, i) => r.id && r.party ? (
            <TapItem key={r.id} id={r.id} title="طرف في الدعوى" className="-mx-2 rounded-xl px-2" row={line(r.name, r.role, r.suggested ? <Suggested label="مقترح · راجعه" /> : null)}>
              <div>
                <p className="text-[17px] font-bold text-text">{r.name}</p>
                <p className="text-[13px] text-text-3">{r.role}</p>
              </div>
              {r.party.representative ? <p className="text-[14px] text-text-2">يمثله: {r.party.representative}</p> : null}
              {r.party.notes ? <p className="text-[14px] text-text-2">{r.party.notes}</p> : null}
              <SheetSource cf={cf} item={r.party} />
              {r.suggested ? <SheetReview table="case_parties" id={r.id} caseId={caseId} /> : null}
            </TapItem>
          ) : <div key={`rep-${i}`}>{line(r.name, r.role)}</div>)}
        </div>
      ) : (
        <p className="py-3.5 text-[13.5px] leading-6 text-text-3">لسه مفيش أطراف متسجلة. قول لـ Clausia مين موكلك ومين الخصم.</p>
      )}
    </ListCard>
  );
}

function Docs({ cf, caseId }: { cf: CaseFile; caseId: string }) {
  const docs = cf.documents;
  const shown = docs.slice(0, 8);
  // mockup: the header shows only the count; it opens the documents view
  const all = <Link href={`/cases/${caseId}?tab=documents`} aria-label="كل المستندات" className="-my-3 inline-flex min-h-11 min-w-11 items-center justify-end text-[12px] text-text-3 hover:text-text hover:underline"><span className="font-num">{docs.length}</span></Link>;
  return (
    <ListCard title="المستندات" end={all}>
      {shown.length ? (
        <div className="lg:[&>*]:border-t [&>*+*]:border-t [&>*]:border-[var(--hairline-v2)]">
          {shown.map((d) => (
            <a key={d.id} href={`/api/documents/${d.id}`} target="_blank" rel="noopener" title={d.file_name}
              className="-mx-2 block min-h-11 rounded-xl px-2 py-3 transition-colors hover:bg-card-2/60">
              <span className="block truncate text-[14px] font-semibold text-text">{docName(d)}</span>
              <span className="mt-0.5 block text-[11.5px] text-text-3">{[pagesLabel(d.page_count), READ_SHORT[d.read_status] ?? d.read_status].filter(Boolean).join(" · ")}</span>
            </a>
          ))}
          {docs.length ? <div className="flex justify-end py-1 lg:hidden"><Link href={`/cases/${caseId}?tab=documents`} className="-my-1 inline-flex min-h-11 items-center gap-1 text-[12px] text-text-3 hover:text-text hover:underline"><span className="font-num">{docs.length}</span> الكل ←</Link></div> : null}
        </div>
      ) : (
        <p className="py-3.5 text-[13.5px] leading-6 text-text-3">لسه مفيش مستندات. ارفع صحيفة الدعوى أو أي ورقة من «+» تحت، وClausia هيقراها صفحة صفحة.</p>
      )}
    </ListCard>
  );
}

// ---------- Page body ----------

export function CaseOverview({ cf, hs, today, caseId, chatHref }: { cf: CaseFile; hs: HearingState; today: string; caseId: string; chatHref: string }) {
  const parties = partyRows(cf.parties, pendingOf<Party>(cf, "case_parties")).length;
  const facts = cf.facts.length + pendingOf<Fact>(cf, "case_facts").length;
  return (
    <TabScope>
      <div className="mt-3 flex flex-col gap-3 leading-[1.35] lg:mt-[34px] lg:grid lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] lg:items-start lg:gap-[18px]">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-[18px]">
          <Summary cf={cf} hs={hs} today={today} className="order-2 mt-1.5 lg:order-none lg:mt-0" />
          <ReviewBanner cf={cf} hs={hs} caseId={caseId} className="order-3" />
          <SegBar className="order-4 mt-2.5 lg:hidden" items={[
            { key: "facts", label: "الوقائع", count: facts },
            { key: "docs", label: "المستندات", count: cf.documents.length },
            { key: "parties", label: "الأطراف", count: parties },
          ]} />
          <Seg k="facts" className="order-5 lg:order-none"><Facts cf={cf} caseId={caseId} /></Seg>
          <Sides cf={cf} caseId={caseId} className="order-6 lg:order-none" />
          <Judgments cf={cf} caseId={caseId} className="order-7 lg:order-none" />
          <p className="order-8 flex flex-wrap gap-x-1 px-2 text-xs text-text-4 lg:order-none">
            <Link href={`/cases/${caseId}?tab=details`} className="-my-2 inline-flex min-h-11 items-center hover:text-text-2 hover:underline">بيانات الدعوى</Link>
            <span className="self-center">·</span>
            <Link href={`/cases/${caseId}?tab=hearings`} className="-my-2 inline-flex min-h-11 items-center hover:text-text-2 hover:underline">الجلسات</Link>
            <span className="self-center">·</span>
            <Link href={chatHref} className="-my-2 inline-flex min-h-11 items-center hover:text-text-2 hover:underline">محادثة القضية</Link>
            <span className="self-center">·</span>
            <a href={`/api/cases/${caseId}/case-file?download`} className="-my-2 inline-flex min-h-11 items-center hover:text-text-2 hover:underline">تنزيل ملف القضية (JSON)</a>
          </p>
        </div>
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-[18px]">
          <HearingCard cf={cf} hs={hs} today={today} caseId={caseId} className="order-1 lg:order-none" />
          <Seg k="parties" className="order-5 lg:order-none"><Parties cf={cf} caseId={caseId} /></Seg>
          <Seg k="docs" className="order-5 lg:order-none"><Docs cf={cf} caseId={caseId} /></Seg>
        </div>
      </div>
    </TabScope>
  );
}
