// The case page's default view (docs/design/{Light,Dark}{,Mobile}Case.dc.html, v2), built from getCaseFile.
// Desktop: لنا/ضدنا as a full-width first row, then the main column (Clausia summary, facts timeline) + side column
// (next hearing, parties, documents), all solid cards. Judgments live in the hearings view and the case links in the «…» menu (owner
// decisions). Mobile: one column in the mobile mockup's order — the two columns become
// `display: contents` and `order-*` sorts them — with Facts / Docs / Parties as tabs (CaseTabs).
// Rows show no edit links: tapping an item opens its actions (confirm / reject / edit) in the sheet (ItemSheet).
import { Check, ChevronLeft, Shield, Target } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SourceChip } from "@/components/cite/SourceChip";
import { AskTarget } from "@/components/cases/AskTarget";
import { WriteReply } from "@/components/cases/ReplyButton";
import { memoLine, ourSideLabel, replyCount, replyStatus } from "@/components/cases/sides";
import { SegBar, Seg, TabScope } from "@/components/cases/CaseTabs";
import { SheetEditText, SheetReview, TapItem } from "@/components/cases/ItemSheet";
import { pagesLabel } from "@/components/documents/DocThumb";
import type { CaseFile } from "@/lib/case-file";
import { formatDayLabel, formatDmy } from "@/lib/dates";
import type { PendingEdits, PendingRow } from "@/lib/edits";
import { Change, SuggestedTag, WaitingLine } from "@/components/cases/Suggest";
import {
  MONTHS, READ_SHORT, aboutItem, agoLabel, citeOf, daysBetween, docName, factDate, partyRows, pendingHref, pendingWords, shortDmy, sourceText,
  summarySegments, untilLabel, type HearingState,
} from "@/components/cases/case-view";

type Fact = CaseFile["facts"][number];
type Req = CaseFile["requests"][number];
type Arg = CaseFile["arguments"][number];
type Party = CaseFile["parties"][number];

const REQUEST_KIND: Record<string, string> = { primary: "طلب أصلي", alternative: "طلب احتياطي", precautionary: "طلب تحفظي" };
const ARG_KIND: Record<string, string> = { formal_defense: "دفع شكلي", substantive_defense: "دفع موضوعي", argument: "دفاع" };

/** Solid content card (mockup: 24–26px radius, hairline, deep soft shadow). */
const CARD = "rounded-xl border border-border-2 bg-card shadow-card";

/** «مقترحة · راجعها»: a 5px gold dot + 11px gold word (needs the lawyer's action). */
export const Suggested = ({ label = "مقترحة · راجعها" }: { label?: string }) => (
  <span className="inline-flex items-center gap-1.25 text-xs font-semibold text-gold"><span aria-hidden className="size-dot rounded-full bg-gold" />{label}</span>
);

/** The Clausia «C» mark (mockup: 32px / 11px radius / 15px on desktop, 26px / 9px / 12px on mobile; a hairline + inner light in dark). */
const MARK = "mark font-num inline-flex shrink-0 items-center justify-center font-extrabold size-mark rounded-sm text-sm lg:size-8 lg:rounded-md lg:text-md dark:border dark:border-white/8 dark:shadow-[var(--mark-shadow)]";

function pendingOf<T>(cf: CaseFile, table: string): T[] {
  return cf.pending_suggestions.filter((p) => p.table === table).map((p) => p.item as T);
}

/** Source + quote block inside a sheet. Quoted court / document text is verbatim, in Naskh. */
function SheetSource({ cf, item, about }: { cf: CaseFile; item: { id: string; review_status: string; created_by: string; source: CaseFile["facts"][number]["source"] }; about: string }) {
  // a paper source is a chip that opens the paper at the sentence (the sheet closes first); other sources stay a word
  const cite = citeOf(`item:${item.id}`, item.source, cf.documents, about);
  return (
    <div className="space-y-1.5 rounded-md bg-card-2 px-4 py-3 text-sm text-text-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {cite ? <SourceChip cite={cite} /> : sourceText(item.source, cf.documents)}
        <span>· {item.review_status === "suggested" ? "مقترحة، لسه ما اتأكدتش" : "مؤكدة"} · {item.created_by === "model" ? "صاغها Clausia" : "كتبها المحامي"}</span>
      </p>
      {item.source.quote ? <p className="text-doc text-base text-text-2">«{item.source.quote}»</p> : null}
      {item.source.document_id ? <a href={`/api/documents/${item.source.document_id}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center font-semibold text-text-2 underline-offset-4 hover:underline">فتح المستند</a> : null}
    </div>
  );
}

// ---------- Summary + review banner ----------

/**
 * Desktop: «ملخص Clausia» + the full templated summary (hearing, review in gold). Mobile: no label and only the case's
 * own summary sentence (the hearing card and the review banner carry the rest); without one, the full summary.
 */
function Summary({ cf, hs, today, className, edits }: { cf: CaseFile; hs: HearingState; today: string; className: string; edits?: PendingEdits }) {
  // a summary the chat proposed: the old one struck, the new one in the text, all in a gold wash
  const next = edits?.casePatch?.summary;
  const proposed = typeof next === "string" && next.trim() !== (cf.case.summary ?? "").trim() ? next : null;
  const was = cf.case.summary?.trim() || null;
  if (proposed) cf = { ...cf, case: { ...cf.case, summary: proposed } };
  const segs = summarySegments(cf, hs, today).map((s, i) => s.gold ? <span key={i} className="font-semibold text-gold">{s.text}</span> : <span key={i}>{s.text}</span>);
  const own = cf.case.summary?.trim();
  return (
    <AskTarget item={{ kind: "summary", id: cf.case.id, label: own || "ملخص القضية" }} className={`flex items-start gap-2.5 px-1 lg:gap-3.5 lg:px-2 ${className}`}>
      <span aria-hidden className={MARK}>C</span>
      <div className={`min-w-0 flex-1 ${proposed ? "gold-wash rounded-lg px-3.5 py-2.5" : ""}`}>
        {proposed ? (
          <div>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-gold">ملخص مقترح<SuggestedTag /></div>
            {was ? <p className="mt-1 text-base leading-[1.8] text-text-4 line-through">{was}</p> : null}
          </div>
        ) : null}
        <div className={`hidden text-sm font-semibold text-gold lg:block ${proposed ? "lg:hidden" : ""}`}>ملخص Clausia</div>
        <p className="mt-0.5 text-base leading-[1.8] text-text lg:hidden">{own ? (/[.!؟]$/u.test(own) ? own : `${own}.`) : segs}</p>
        <p className="mt-1 hidden text-lg leading-[1.85] text-text lg:block">{segs}</p>
      </div>
    </AskTarget>
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
        const cls = "flex min-h-11 items-center gap-2.5 rounded-lg border border-gold-edge px-3.5 py-3 text-base text-text";
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
  const cite = citeOf(`item:${f.id}`, f.source, cf.documents, aboutItem("واقعة", `${factDate(f.date, f.date_precision)} · ${f.text}`));
  const dated = f.date && f.date_precision !== "unknown";
  return (
    <span className="flex gap-3.5">
      <span className={`font-num w-16 shrink-0 pt-1 text-sm font-semibold lg:w-19.5 ${dated ? "text-text" : "text-text-4"}`}>
        <span className={f.date_precision === "day" ? "num" : ""}>{factDate(f.date, f.date_precision)}</span>
      </span>
      <span className="flex w-2.25 shrink-0 flex-col items-center" aria-hidden>
        <span className={`mt-2.25 size-dot-lg shrink-0 rounded-full ${suggested ? "bg-gold" : "bg-text-3"}`} />
        {!last ? <span className="mt-1 w-px flex-1 bg-border-2" /> : null}
      </span>
      <span className="min-w-0 flex-1 pb-4.5">
        <span className="text-doc block text-md text-text" style={{ lineHeight: 1.9 }}>{f.text}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-2">
          {cite ? <SourceChip cite={cite} className="z-10" /> : <span className="text-xs text-text-4">{sourceText(f.source, cf.documents)}</span>}
          {suggested ? null : <span className="text-xs text-text-4">{cite ? "· " : ""}{cite ? "مؤكدة" : "· مؤكدة"}</span>}
          {suggested ? <Suggested /> : null}
        </span>
      </span>
    </span>
  );
}

/** A new row of the timeline that the chat proposed (a fact, a hearing, a decision): a gold wash, the date in gold, «مستني تأكيدك». */
function NewFactRow({ r, last }: { r: PendingRow; last: boolean }) {
  return (
    <div className="gold-wash mb-1.5 rounded-md px-1.5 lg:px-2" data-pending-row>
      <span className="flex gap-3.5">
        <span className="font-num w-16 shrink-0 pt-1 text-sm font-semibold text-gold lg:w-19.5"><span className="num">{r.date ?? "غير محدد"}</span></span>
        <span className="flex w-2.25 shrink-0 flex-col items-center" aria-hidden>
          <span className="mt-2.25 size-dot-lg shrink-0 rounded-full bg-gold" />
          {!last ? <span className="mt-1 w-px flex-1 bg-border-2" /> : null}
        </span>
        <span className="min-w-0 flex-1 pb-3">
          <span className="text-doc block text-md text-text" style={{ lineHeight: 1.9 }}>{r.text}</span>
          <WaitingLine />
        </span>
      </span>
    </div>
  );
}

type TimelineEntry = { sort: string | null; fact?: Fact; row?: PendingRow };

function Facts({ cf, caseId, edits }: { cf: CaseFile; caseId: string; edits?: PendingEdits }) {
  const all: TimelineEntry[] = [
    ...[...cf.facts, ...pendingOf<Fact>(cf, "case_facts")].map((f) => ({ sort: f.date && f.date_precision !== "unknown" ? f.date : null, fact: f })),
    ...(edits?.timeline ?? []).map((r) => ({ sort: r.sortIso, row: r })),
  ].sort((a, b) => {
    if (a.sort === b.sort) return 0;
    if (!a.sort) return 1;
    if (!b.sort) return -1;
    return a.sort < b.sort ? -1 : 1;
  });
  const c = cf.case;
  const fd = c.facts_date && c.facts_date_precision !== "unknown" ? formatDmy(c.facts_date, c.facts_date_precision) : null;
  const patch = edits?.casePatch;
  const newFd = patch?.facts_date ? formatDmy(patch.facts_date, (patch.facts_date_precision ?? "day") as "day") : null;
  const fdProposed = newFd && newFd !== fd ? newFd : null;
  return (
    <section id="facts" className={`scroll-mt-24 ${CARD} rounded-xl`} aria-label="الوقائع">
      <div className="flex items-baseline justify-between gap-3 px-4.5 pt-4 lg:px-6 lg:pb-1.5 lg:pt-4.5">
        <h2 className="hidden text-lg font-bold text-title lg:block">الوقائع</h2>
        {fdProposed ? (
          <span className="gold-wash inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs text-gold">
            تاريخ الوقائع <Change old={fd} next={fdProposed} className="num font-num" /> <SuggestedTag />
          </span>
        ) : (
          <span className="text-xs text-text-4">تاريخ الوقائع {fd ? <span className="num font-num">{fd}</span> : "مش محدد"} · بيحدد نسخة القانون</span>
        )}
      </div>
      {all.length ? (
        <div className="px-3 pb-1.5 pt-2.5 lg:px-4">
          {all.map((e, i) => e.row ? <NewFactRow key={e.row.key} r={e.row} last={i === all.length - 1} /> : e.fact && ((f) => (
            <AskTarget key={f.id} item={{ kind: "fact", id: f.id, label: `${factDate(f.date, f.date_precision)} · ${f.text}` }}>
            <TapItem id={f.id} title="واقعة" tight className="rounded-md px-1.5 lg:px-2" row={<FactRow f={f} last={i === all.length - 1} cf={cf} />}>
              <p className="font-num text-sm font-bold text-title">{factDate(f.date, f.date_precision)}{f.date_text && f.date_text !== factDate(f.date, f.date_precision) ? <span className="font-sans font-normal text-text-4"> · «{f.date_text}»</span> : null}</p>
              <p className="text-doc text-lg text-text">{f.text}</p>
              <SheetSource cf={cf} item={f} about={aboutItem("واقعة", `${factDate(f.date, f.date_precision)} · ${f.text}`)} />
              {f.review_status === "suggested" ? <SheetReview table="case_facts" id={f.id} caseId={caseId} /> : null}
              <SheetEditText table="case_facts" id={f.id} caseId={caseId} initial={f.text} />
            </TapItem>
            </AskTarget>
          ))(e.fact))}
        </div>
      ) : (
        <p className="px-4.5 pb-5 pt-3 text-base leading-7 text-text-3 lg:px-6">لسه مفيش وقائع. احكي لـ Clausia اللي حصل وتواريخه، أو ارفع صحيفة الدعوى.</p>
      )}
    </section>
  );
}

// ---------- لنا / ضدنا ----------

/**
 * One request or argument: a row that opens its sheet (confirm / reject / edit). `number`: the request's number (the mockup's
 * big light digit). `status` + `action`: the top line of a defense of the opponent («محتاج رد» / «اترد عليه» and its button).
 * The source chip (or the source word) sits under the text. Buttons in the row are above the stretched row button (z-10).
 */
function TextItem({ cf, caseId, table, item, kindLabel, number, status, action, indent = false }: {
  cf: CaseFile; caseId: string; table: "case_requests" | "case_arguments"; item: Req | Arg; kindLabel: string | null;
  number?: number; status?: ReactNode; action?: ReactNode; indent?: boolean;
}) {
  const suggested = item.review_status === "suggested";
  const about = aboutItem(table === "case_requests" ? "طلب" : "دفع", item.text);
  const cite = citeOf(`item:${item.id}`, item.source, cf.documents, about);
  return (
    <AskTarget item={{ kind: table === "case_requests" ? "request" : "argument", id: item.id, label: item.text }} className="isolate border-t border-border-2">
    <TapItem id={item.id} title={table === "case_requests" ? "طلب" : "دفع / دفاع"} tight className="-mx-2 rounded-md px-2"
      row={
        <span className="flex gap-3 py-3.5">
          {number !== undefined ? <span className="font-num w-5.5 shrink-0 text-lg font-light text-text-3">{number}</span> : indent ? <span aria-hidden className="w-5.5 shrink-0" /> : null}
          <span className="block min-w-0 flex-1">
            {status ? <span className="mb-1.5 flex items-center justify-between gap-2">{status}{action}</span> : null}
            {indent && kindLabel ? <span className="block text-xs text-text-4">{kindLabel}</span> : null}
            <span className="block text-base font-semibold leading-[1.6] text-text">{item.text}</span>
            <span className="mt-1.5 flex flex-wrap items-center gap-2">
              {cite ? <SourceChip cite={cite} className="z-10" /> : <span className="text-xs text-text-4">{sourceText(item.source, cf.documents)}</span>}
              {suggested ? <Suggested /> : null}
            </span>
          </span>
        </span>
      }>
      {kindLabel ? <p className="text-sm font-bold text-text-3">{kindLabel}</p> : null}
      <p className="text-doc text-lg text-text">{item.text}</p>
      <SheetSource cf={cf} item={item} about={about} />
      {suggested ? <SheetReview table={table} id={item.id} caseId={caseId} /> : null}
      <SheetEditText table={table} id={item.id} caseId={caseId} initial={item.text} />
    </TapItem>
    </AskTarget>
  );
}

/** A request or an argument the chat proposed: a gold wash, «مستني تأكيدك». */
function NewText({ r }: { r: PendingRow }) {
  return (
    <div className="gold-wash -mx-2 my-1.5 rounded-md px-2 py-1.5" data-pending-row>
      <span className="block text-base font-semibold leading-[1.6] text-text">{r.text}</span>
      <WaitingLine />
    </div>
  );
}

/** «محتاج رد»: a gold dot and word; «اترد عليه»: a check and a quiet word */
const NeedsReply = () => (
  <span className="inline-flex items-center gap-1.5 text-sm font-bold text-gold"><span aria-hidden className="size-1.5 rounded-full bg-gold" />محتاج رد</span>
);
const Replied = () => (
  <span className="inline-flex items-center gap-1.25 text-sm text-text-3"><Check aria-hidden size={13} strokeWidth={2.4} />اترد عليه</span>
);

/** The two cards of the mockup (Sides*): ours (solid ink header, numbered requests) and theirs (thin gold outline, a warm header, a status per defense). */
function Sides({ cf, caseId, className, edits }: { cf: CaseFile; caseId: string; className: string; edits?: PendingEdits }) {
  const requests = [...cf.requests, ...pendingOf<Req>(cf, "case_requests")];
  const args = [...cf.arguments, ...pendingOf<Arg>(cf, "case_arguments")];
  const ours = args.filter((a) => a.side === "ours");
  const theirs = args.filter((a) => a.side === "opponent");
  const newOurs = [...(edits?.requests ?? []), ...(edits?.arguments ?? []).filter((r) => r.side === "ours")];
  const newTheirs = (edits?.arguments ?? []).filter((r) => r.side !== "ours");
  const { needs, total } = replyCount(theirs, ours);
  const memo = memoLine(theirs, cf.documents);
  const side = ourSideLabel(cf.case.client_role);
  const empty = (t: string) => <p className="py-3.5 text-base leading-[1.7] text-text-4">{t}</p>;
  const head = "flex items-center gap-3 rounded-t-xl px-6 py-4";
  const tile = "inline-flex size-8.5 shrink-0 items-center justify-center rounded-md";
  return (
    <div className={`grid gap-3.5 lg:grid-cols-2 lg:gap-4 ${className}`}>
      <section aria-label="لنا · طلباتنا" className={CARD}>
        <div className={`${head} bg-selected text-on-selected`}>
          <span aria-hidden className={`${tile} bg-on-selected/10 text-mark-fg`}><Target size={17} strokeWidth={2} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-md font-bold">لنا · طلباتنا</h2>
            {side ? <p className="text-sm text-on-selected/65">{side}</p> : null}
          </div>
          <span className="font-num text-xl font-extralight">{requests.length}</span>
        </div>
        <div className="px-6 pb-2">
          {requests.map((r, i) => <TextItem key={r.id} cf={cf} caseId={caseId} table="case_requests" item={r} number={i + 1} kindLabel={r.kind ? REQUEST_KIND[r.kind] ?? r.kind : null} />)}
          {ours.map((a) => <TextItem key={a.id} cf={cf} caseId={caseId} table="case_arguments" item={a} indent kindLabel={`دفاعنا${a.kind ? ` · ${ARG_KIND[a.kind] ?? a.kind}` : ""}`} />)}
          {newOurs.map((r) => <NewText key={r.key} r={r} />)}
          {!requests.length && !ours.length && !newOurs.length ? empty("لسه مفيش طلبات متسجلة.") : null}
        </div>
      </section>
      <section aria-label="ضدنا · دفوع الخصم" className="gold-ring rounded-xl bg-card">
        <div className={`${head} border-b border-border-2 bg-gold-bg`}>
          <span aria-hidden className={`${tile} gold-ring text-gold`}><Shield size={17} strokeWidth={2} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-md font-bold text-text">ضدنا · دفوع الخصم</h2>
            {memo ? <p className="text-sm text-text-3">{memo}</p> : null}
          </div>
          {total ? (
            <div className="text-end">
              <div className="font-num text-xl font-extralight text-gold">{needs}<span className="text-md text-text-4"> / {total}</span></div>
              <div className="text-xs text-text-3">محتاجين رد</div>
            </div>
          ) : null}
        </div>
        <div className="px-6 pb-2">
          {theirs.map((a) => {
            const kindLabel = a.kind ? ARG_KIND[a.kind] ?? a.kind : null;
            // a defense that is only suggested has nothing to answer yet: the lawyer reviews it first
            if (a.review_status !== "confirmed") return <TextItem key={a.id} cf={cf} caseId={caseId} table="case_arguments" item={a} kindLabel={kindLabel} />;
            const done = replyStatus(a, ours) === "done";
            return (
              <TextItem key={a.id} cf={cf} caseId={caseId} table="case_arguments" item={a} kindLabel={kindLabel}
                status={done ? <Replied /> : <NeedsReply />}
                action={done
                  ? <a href={`#item-${a.reply_argument_id}`} className="tap relative z-10 inline-flex h-8 items-center rounded-full border border-border-2 px-3.5 text-sm font-semibold text-text-2 transition-colors hover:bg-card-2">شوف الرد</a>
                  : <WriteReply item={{ kind: "argument", id: a.id, label: a.text }} />} />
            );
          })}
          {newTheirs.map((r) => <NewText key={r.key} r={r} />)}
          {!theirs.length && !newTheirs.length ? empty("لسه مفيش دفوع للخصم متسجلة.") : null}
        </div>
      </section>
    </div>
  );
}

// ---------- Side column ----------

/** Big light day + month, then the hearing's lines (mockup: next-hearing card). */
function DayBlock({ iso }: { iso: string }) {
  const [, m, d] = iso.split("-").map(Number);
  return (
    <div className="w-11 shrink-0 text-center leading-none lg:w-auto lg:min-w-12">
      <div className="stat-num text-2xl text-title lg:text-display lg:tracking-[-0.04em]" style={{ fontWeight: 200 }}>{d}</div>
      <div className="mt-1 text-xs text-text-3 lg:mt-1.5 lg:text-sm">{MONTHS[m - 1]}</div>
    </div>
  );
}

function HearingCard({ cf, hs, today, caseId, className, edits }: { cf: CaseFile; hs: HearingState; today: string; caseId: string; className: string; edits?: PendingEdits }) {
  const circuit = cf.case.circuit;
  const all = <Link href={`/cases/${caseId}?tab=hearings`} className="-my-3 inline-flex min-h-11 shrink-0 items-center text-sm text-text-3 hover:text-text hover:underline">الجلسات ←</Link>;
  const h = hs.next ?? hs.undecided;
  if (!h) {
    return (
      <div className={`${CARD} flex items-center justify-between gap-3 px-4.5 py-4 lg:p-5.5 ${className}`}>
        <div>
          <p className="text-md font-bold text-text">مفيش جلسة جاية متسجلة</p>
          <p className="mt-0.5 text-sm text-text-3">لما يتحدد ميعاد، قوله لـ Clausia.</p>
        </div>
        {all}
      </div>
    );
  }
  // «circuit · location» when the hearing's location is stored; never guessed (owner decision)
  const where = [circuit, h.location].filter(Boolean).join(" · ");
  const upcoming = h === hs.next;
  const [y, m, d] = h.date.split("-").map(Number);
  const weekday = formatDayLabel(h.date).split(" ")[0];
  const needed = upcoming ? hs.nextNeeded : hs.undecidedNeeded;
  const when = upcoming ? `الجلسة الجاية · ${untilLabel(daysBetween(today, h.date))}` : `آخر جلسة · ${agoLabel(daysBetween(h.date, today))}`;
  const decide = !upcoming ? (
    <Link href={`/cases/${caseId}?tab=hearings#h-${h.id}`} className="relative -my-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-gold hover:underline">
      <span aria-hidden className="size-1.5 rounded-full bg-gold" />محتاجة قرار · سجّله
    </Link>
  ) : null;
  // the mockup draws no «الجلسات ←» link: the whole card opens the hearings view (an overlay link, so the
  // «سجّله» link inside stays a separate, non-nested target)
  return (
    <AskTarget item={{ kind: "hearing", id: h.id, label: `${upcoming ? "الجلسة الجاية" : "آخر جلسة"} · ${formatDmy(h.date)}${where ? ` · ${where}` : ""}` }} className={className}>
    <div className={`${CARD} relative px-4.5 py-4 transition-colors hover:bg-card-2/40 lg:p-5.5`}>
      <Link href={`/cases/${caseId}?tab=hearings`} aria-label="الجلسات" className="absolute inset-0 rounded-[inherit]" /* ds-allow: the link overlay takes its card's radius */ />
      <div className="flex items-center gap-4 lg:gap-4.5">
        <DayBlock iso={h.date} />
        <div className="min-w-0 flex-1 border-s border-border-2 ps-4 lg:ps-4.5">
          <div className="text-xs text-text-3 lg:text-sm">{when}</div>
          <div className="mt-0.75 text-md font-bold text-text lg:mt-1">
            {weekday} <span className="num font-num lg:hidden">{d}/{m}</span><span className="num font-num hidden lg:inline">{d}/{m}/{y}</span>
            {where ? <span className="lg:hidden"> · {where}</span> : null}
          </div>
          {where ? <div className="mt-0.5 hidden text-sm text-text-3 lg:block">{where}</div> : null}
          {needed ? (
            <div className="mt-1 flex items-center gap-1.5 text-sm text-text lg:hidden">
              <span aria-hidden className={`size-dot shrink-0 rounded-full ${upcoming ? "bg-gold" : "bg-text-4"}`} />
              <span className="min-w-0">{upcoming ? "" : "كان المطلوب: "}{needed}</span>
            </div>
          ) : null}
          {decide ? <div className="mt-1.5 lg:hidden">{decide}</div> : null}
        </div>
      </div>
      {needed || decide ? (
        <div className="mt-4.5 hidden space-y-2 border-t border-border-2 pt-3.5 lg:block">
          {needed ? (
            <div className="flex items-center gap-2 text-base">
              <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${upcoming ? "bg-gold" : "bg-text-4"}`} />
              <span className="text-text-3">{upcoming ? "المطلوب:" : "كان المطلوب:"}</span>
              <span className="font-semibold text-text">{needed}</span>
            </div>
          ) : null}
          {decide}
        </div>
      ) : null}
      {/* a decision the chat proposed: the next hearing (old struck → new) and the decision, in a gold wash */}
      {edits?.decisions.length ? (
        <div className="gold-wash relative mt-4.5 space-y-2.5 rounded-lg px-4 py-3" data-pending-row>
          {edits.decisions.flatMap((d) => d.rows).map((r) => (
            <div key={r.key}>
              <div className="flex items-center gap-1.5 text-xs text-gold">{r.label}<SuggestedTag /></div>
              <div className="mt-0.75 text-md font-semibold leading-[1.5]"><Change old={r.old} next={r.new} /></div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
    </AskTarget>
  );
}

function ListCard({ title, end, children, className = "" }: { title?: string; end?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${CARD} px-4.5 py-1.5 lg:px-5.5 ${className}`} aria-label={title}>
      {title ? (
        <div className="hidden items-center justify-between pb-1.5 pt-3.5 lg:flex">
          <h2 className="text-base font-bold text-text">{title}</h2>
          {end}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function Parties({ cf, caseId, edits }: { cf: CaseFile; caseId: string; edits?: PendingEdits }) {
  const rows = partyRows(cf.parties, pendingOf<Party>(cf, "case_parties"));
  const line = (name: string, role: string, extra?: ReactNode) => (
    <span className="block py-3">
      <span className="flex items-center gap-2">
        <span className="min-w-0 truncate text-base font-semibold text-text">{name}</span>
        {extra}
      </span>
      <span className="mt-0.5 block text-xs text-text-3">{role}</span>
    </span>
  );
  return (
    <ListCard title="الأطراف">
      {rows.length || edits?.parties.length ? (
        <div className="lg:[&>*]:border-t [&>*+*]:border-t [&>*]:border-[var(--border-2)]">
          {(edits?.parties ?? []).map((n) => (
            <div key={n.key} className="gold-wash -mx-2 my-1.5 rounded-md px-2" data-pending-row>
              {line(n.name, `${n.ours ? "موكلنا · " : ""}${n.role}`, <SuggestedTag />)}
              <span className="-mt-2 mb-2 block"><WaitingLine /></span>
            </div>
          ))}
          {rows.map((r, i) => r.id && r.party ? (
            <AskTarget key={r.id} item={{ kind: "party", id: r.id, label: `${r.name} · ${r.role}` }}>
            <TapItem id={r.id} title="طرف في الدعوى" className="-mx-2 rounded-md px-2" row={line(r.name, r.role, r.suggested ? <Suggested label="مقترح · راجعه" /> : null)}>
              <div>
                <p className="text-lg font-bold text-text">{r.name}</p>
                <p className="text-sm text-text-3">{r.role}</p>
              </div>
              {r.party.representative ? <p className="text-base text-text-2">يمثله: {r.party.representative}</p> : null}
              {r.party.notes ? <p className="text-base text-text-2">{r.party.notes}</p> : null}
              <SheetSource cf={cf} item={r.party} about={aboutItem("طرف", r.name)} />
              {r.suggested ? <SheetReview table="case_parties" id={r.id} caseId={caseId} /> : null}
            </TapItem>
            </AskTarget>
          ) : <div key={`rep-${i}`}>{line(r.name, r.role)}</div>)}
        </div>
      ) : (
        <p className="py-3.5 text-base leading-6 text-text-3">لسه مفيش أطراف متسجلة. قول لـ Clausia مين موكلك ومين الخصم.</p>
      )}
    </ListCard>
  );
}

function Docs({ cf, caseId }: { cf: CaseFile; caseId: string }) {
  const docs = cf.documents;
  const shown = docs.slice(0, 8);
  // mockup: the header shows only the count; it opens the documents view
  const all = <Link href={`/cases/${caseId}?tab=documents`} aria-label="كل المستندات" className="-my-3 inline-flex min-h-11 min-w-11 items-center justify-end text-sm text-text-3 hover:text-text hover:underline"><span className="font-num">{docs.length}</span></Link>;
  return (
    <ListCard title="المستندات" end={all}>
      {shown.length ? (
        <div className="lg:[&>*]:border-t [&>*+*]:border-t [&>*]:border-[var(--border-2)]">
          {shown.map((d) => (
            <AskTarget key={d.id} item={{ kind: "document", id: d.id, label: docName(d) }}>
            <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener" title={d.file_name}
              className="-mx-2 block min-h-11 rounded-md px-2 py-3 transition-colors hover:bg-card-2/60">
              <span className="block truncate text-base font-semibold text-text">{docName(d)}</span>
              <span className="mt-0.5 block text-xs text-text-3">{[pagesLabel(d.page_count), READ_SHORT[d.read_status] ?? d.read_status].filter(Boolean).join(" · ")}</span>
            </a>
            </AskTarget>
          ))}
          {docs.length ? <div className="flex justify-end py-1 lg:hidden"><Link href={`/cases/${caseId}?tab=documents`} className="-my-1 inline-flex min-h-11 items-center gap-1 text-sm text-text-3 hover:text-text hover:underline"><span className="font-num">{docs.length}</span> الكل ←</Link></div> : null}
        </div>
      ) : (
        <p className="py-3.5 text-base leading-6 text-text-3">لسه مفيش مستندات. ارفع صحيفة الدعوى أو أي ورقة من «+» تحت، وClausia هيقراها صفحة صفحة.</p>
      )}
    </ListCard>
  );
}

// ---------- Page body ----------

export function CaseOverview({ cf, hs, today, caseId, edits }: { cf: CaseFile; hs: HearingState; today: string; caseId: string; edits?: PendingEdits }) {
  const parties = partyRows(cf.parties, pendingOf<Party>(cf, "case_parties")).length;
  const facts = cf.facts.length + pendingOf<Fact>(cf, "case_facts").length;
  return (
    <TabScope>
      <div className="mt-3 flex flex-col gap-3 leading-[1.35] lg:mt-8.5 lg:grid lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] lg:items-start lg:gap-4.5">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4.5">
          <Summary cf={cf} hs={hs} today={today} edits={edits} className="order-2 mt-1.5 lg:order-none lg:mt-0" />
          <ReviewBanner cf={cf} hs={hs} caseId={caseId} className="order-3" />
          <SegBar className="order-4 mt-2.5 lg:hidden" items={[
            { key: "facts", label: "الوقائع", count: facts },
            { key: "docs", label: "المستندات", count: cf.documents.length },
            { key: "parties", label: "الأطراف", count: parties },
          ]} />
          <Seg k="facts" className="order-5 lg:order-none"><Facts cf={cf} caseId={caseId} edits={edits} /></Seg>
        </div>
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4.5">
          <HearingCard cf={cf} hs={hs} today={today} caseId={caseId} edits={edits} className="order-1 lg:order-none" />
          <Seg k="parties" className="order-5 lg:order-none"><Parties cf={cf} caseId={caseId} edits={edits} /></Seg>
          <Seg k="docs" className="order-5 lg:order-none"><Docs cf={cf} caseId={caseId} /></Seg>
        </div>
        {/* desktop: its own full-width first row, right under the header card (two equal cards, mockup Sides*; owner 2026-10-23); phone: after the facts, as before */}
        <Sides cf={cf} caseId={caseId} edits={edits} className="order-6 lg:order-first lg:col-span-2" />
      </div>
    </TabScope>
  );
}
