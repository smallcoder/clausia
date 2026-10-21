// The case page's default view (docs/design/{Light,Dark}{,Mobile}Case.dc.html), built from getCaseFile.
// Desktop: main column (summary, facts, لنا/ضدنا, judgments) + side column (next hearing, parties, documents).
// Mobile: one column in the mobile mockup's order — the two columns become `display: contents` and `order-*` sorts them.
import Link from "next/link";
import type { ReactNode } from "react";
import { SheetEditText, SheetReview, TapItem } from "@/components/cases/ItemSheet";
import { ClausiaSays, Panel, StatusChip } from "@/components/shell/PageHero";
import type { CaseFile } from "@/lib/case-file";
import { formatDayLabel, formatDmy } from "@/lib/dates";
import { JUDGMENT_KIND, READ_STATUS } from "@/lib/labels";
import {
  MONTHS, daysBetween, docName, factDate, initials, partyRows, sourceText, summarySentences, untilLabel, agoLabel,
  type HearingState,
} from "@/components/cases/case-view";

type Fact = CaseFile["facts"][number];
type Req = CaseFile["requests"][number];
type Arg = CaseFile["arguments"][number];
type Party = CaseFile["parties"][number];
type Judgment = CaseFile["judgments"][number];

const REQUEST_KIND: Record<string, string> = { primary: "طلب أصلي", alternative: "طلب احتياطي", precautionary: "طلب تحفظي" };
const ARG_KIND: Record<string, string> = { formal_defense: "دفع شكلي", substantive_defense: "دفع موضوعي", argument: "دفاع" };
const OUTCOME: Record<string, { label: string; tone: "good" | "bad" | "warn" }> = {
  for_us: { label: "لصالحنا", tone: "good" }, against_us: { label: "ضدنا", tone: "bad" }, partial: { label: "لصالحنا جزئيًا", tone: "warn" },
};

/** Light: accent gradient with ink text; dark: accent tint with accent text (mockup). */
const SuggestChip = ({ label = "مقترحة · راجعها" }: { label?: string }) => (
  <span className="inline-flex h-5 items-center rounded-full bg-[image:var(--accent-grad)] px-2 text-[10.5px] font-bold text-[var(--ink-solid)] sm:h-[22px] sm:px-[9px] sm:text-[11.5px] dark:bg-warn-bg dark:bg-none dark:text-gold">{label}</span>
);

function pendingOf<T>(cf: CaseFile, table: string): T[] {
  return cf.pending_suggestions.filter((p) => p.table === table).map((p) => p.item as T);
}

/** Source + quote block inside a sheet. */
function SheetSource({ cf, item }: { cf: CaseFile; item: { review_status: string; created_by: string; source: CaseFile["facts"][number]["source"] } }) {
  return (
    <div className="space-y-1.5 rounded-2xl bg-card-2 px-4 py-3 text-[13px] text-text-3">
      <p>{sourceText(item.source, cf.documents)} · {item.review_status === "suggested" ? "مقترحة، لسه ما اتأكدتش" : "مؤكدة"} · {item.created_by === "model" ? "صاغها Clausia" : "كتبها المحامي"}</p>
      {item.source.quote ? <p className="text-doc text-[14px] text-text-2">«{item.source.quote}»</p> : null}
      {item.source.document_id ? <a href={`/api/documents/${item.source.document_id}`} target="_blank" rel="noopener" className="inline-block font-semibold text-gold-text hover:underline">فتح المستند</a> : null}
    </div>
  );
}

// ---------- Summary ----------

function Summary({ cf, hs, today, chatHref, className }: { cf: CaseFile; hs: HearingState; today: string; chatHref: string; className: string }) {
  return (
    <div className={`relative lg:rounded-[20px] lg:border lg:border-[var(--hero-border)] lg:bg-card lg:px-[18px] lg:py-4 lg:shadow-pop ${className}`}>
      <ClausiaSays label="ملخص Clausia">{summarySentences(cf, hs, today).join(" ")}</ClausiaSays>
      <Link href={chatHref} className="absolute end-0 top-0 inline-flex min-h-8 items-center text-xs font-semibold text-gold-text hover:underline lg:end-[18px] lg:top-3.5">المحادثة ←</Link>
    </div>
  );
}

// ---------- Facts ----------

function FactRow({ f, last, cf }: { f: Fact; last: boolean; cf: CaseFile }) {
  const suggested = f.review_status === "suggested";
  const dated = f.date && f.date_precision !== "unknown";
  return (
    <span className="flex gap-2.5 rounded-xl px-1 sm:gap-3.5">
      <span className={`w-[68px] shrink-0 whitespace-nowrap pt-[3px] text-[11.5px] font-bold sm:w-[84px] sm:pt-1 sm:text-[13px] ${dated ? "text-primary" : "text-text-4"}`}>
        <span className={f.date_precision === "day" ? "num" : ""}>{factDate(f.date, f.date_precision)}</span>
      </span>
      <span className="flex w-2.5 shrink-0 flex-col items-center sm:w-3" aria-hidden>
        <span className={`mt-[7px] size-2 shrink-0 rounded-full sm:mt-2 sm:size-[9px] ${suggested ? "bg-warn ring-4 ring-warn-bg" : "bg-primary"}`} />
        {!last ? <span className="mt-1 w-px flex-1 bg-border sm:mt-[5px]" /> : null}
      </span>
      <span className="min-w-0 flex-1 pb-3.5 sm:pb-5">
        <span className="text-doc block text-[14.5px] leading-[1.8] text-text sm:text-[16px] sm:leading-[1.85]">{f.text}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-2 sm:mt-1">
          <span className="text-[10.5px] text-text-4 sm:text-[11.5px]">{sourceText(f.source, cf.documents)}{suggested ? "" : " · مؤكدة"}</span>
          {suggested ? <SuggestChip /> : null}
        </span>
      </span>
    </span>
  );
}

function Facts({ cf, caseId, className }: { cf: CaseFile; caseId: string; className: string }) {
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
    <div id="facts" className={`scroll-mt-24 ${className}`}>
    <Panel title="الوقائع"
      meta={<>تاريخ الوقائع: {fd ? <span className="num">{fd}</span> : "غير محدد"}<span className="hidden sm:inline"> · بيحدد نسخة القانون</span></>}>
      {all.length ? (
        <div className="px-3 pb-1 pt-4 sm:px-4 sm:pt-5">
          {all.map((f, i) => (
            <TapItem key={f.id} id={f.id} title="واقعة" row={<FactRow f={f} last={i === all.length - 1} cf={cf} />}>
              <p className="text-[13px] font-bold text-primary">{factDate(f.date, f.date_precision)}{f.date_text && f.date_text !== factDate(f.date, f.date_precision) ? <span className="font-normal text-text-4"> · «{f.date_text}»</span> : null}</p>
              <p className="text-doc text-[17px] text-text">{f.text}</p>
              <SheetSource cf={cf} item={f} />
              {f.review_status === "suggested" ? <SheetReview table="case_facts" id={f.id} caseId={caseId} /> : null}
              <SheetEditText table="case_facts" id={f.id} caseId={caseId} initial={f.text} />
            </TapItem>
          ))}
        </div>
      ) : (
        <p className="px-5 py-5 text-[14px] leading-7 text-text-3">لسه مفيش وقائع. احكي لـ Clausia اللي حصل وتواريخه، أو ارفع صحيفة الدعوى.</p>
      )}
    </Panel>
    </div>
  );
}

// ---------- لنا / ضدنا ----------

function TextItem({ cf, caseId, table, item, kindLabel }: { cf: CaseFile; caseId: string; table: "case_requests" | "case_arguments"; item: Req | Arg; kindLabel: string | null }) {
  const suggested = item.review_status === "suggested";
  return (
    <TapItem id={item.id} title={table === "case_requests" ? "طلب" : "دفع / دفاع"} className="-mx-2 rounded-lg px-2"
      row={<span className="block py-0.5 text-[13.5px] leading-[1.8] text-text sm:text-[14.5px] sm:leading-[1.9]">{item.text}{suggested ? <> <SuggestChip /></> : null}</span>}>
      {kindLabel ? <p className="text-[13px] font-bold text-text-3">{kindLabel}</p> : null}
      <p className="text-doc text-[17px] text-text">{item.text}</p>
      <SheetSource cf={cf} item={item} />
      {suggested ? <SheetReview table={table} id={item.id} caseId={caseId} /> : null}
      <SheetEditText table={table} id={item.id} caseId={caseId} initial={item.text} />
    </TapItem>
  );
}

function Sides({ cf, caseId, className }: { cf: CaseFile; caseId: string; className: string }) {
  const requests = [...cf.requests, ...pendingOf<Req>(cf, "case_requests")];
  const args = [...cf.arguments, ...pendingOf<Arg>(cf, "case_arguments")];
  const ours = args.filter((a) => a.side === "ours");
  const theirs = args.filter((a) => a.side === "opponent");
  const card = "px-3.5 py-3 lg:rounded-[20px] lg:border lg:border-border-2 lg:bg-card lg:px-[18px] lg:py-4 lg:shadow-soft";
  const empty = (t: string) => <p className="mt-1 text-[13.5px] leading-[1.8] text-text-4">{t}</p>;
  return (
    <div className={`overflow-hidden rounded-[20px] border border-border-2 bg-card shadow-soft lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none ${className}`}>
      <section className={`border-b border-border-2 ${card}`}>
        <h2 className="text-[12px] font-bold text-good sm:text-[13px]">لنا · طلباتنا</h2>
        <div className="mt-1 sm:mt-1.5">
          {requests.map((r) => <TextItem key={r.id} cf={cf} caseId={caseId} table="case_requests" item={r} kindLabel={r.kind ? REQUEST_KIND[r.kind] ?? r.kind : null} />)}
          {ours.map((a) => <TextItem key={a.id} cf={cf} caseId={caseId} table="case_arguments" item={a} kindLabel={`دفاعنا${a.kind ? ` · ${ARG_KIND[a.kind] ?? a.kind}` : ""}`} />)}
          {!requests.length && !ours.length ? empty("لسه مفيش طلبات متسجلة.") : null}
        </div>
      </section>
      <section className={card}>
        <h2 className="text-[12px] font-bold text-bad sm:text-[13px]">ضدنا · دفوع الخصم</h2>
        <div className="mt-1 sm:mt-1.5">
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
    <Panel title="الأحكام" className={className}>
      <ul className="divide-y divide-border-2">
        {rows.map((j) => {
          const outcome = j.outcome ? OUTCOME[j.outcome] : null;
          const suggested = j.review_status === "suggested";
          return (
            <li key={j.id} id={`item-${j.id}`} className="scroll-mt-24 space-y-3 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-bold text-text">{j.date ? <>حكم <span className="num">{formatDmy(j.date)}</span></> : "حكم (التاريخ مش متسجل)"}</span>
                <StatusChip tone="neutral">{JUDGMENT_KIND[j.kind as keyof typeof JUDGMENT_KIND] ?? j.kind}</StatusChip>
                {outcome ? <StatusChip tone={outcome.tone}>{outcome.label}</StatusChip> : null}
                {suggested ? <SuggestChip /> : null}
              </div>
              <div className="rounded-2xl bg-card-2 px-4 py-3">
                <p className="text-xs text-text-4">المنطوق</p>
                <p className="text-doc mt-1 text-[16px] text-text">{j.operative_text}</p>
              </div>
              <p className="text-[13.5px] text-text-2">
                {j.appeal_deadline ? <>آخر ميعاد للطعن: <span className="num font-bold">{formatDmy(j.appeal_deadline)}</span> <span className="text-text-4">· كما ذكره المحامي</span>{j.appeal_deadline_note ? <span className="mt-1 block text-text-4">{j.appeal_deadline_note}</span> : null}</>
                  : <span className="text-text-4">ميعاد الطعن مش متسجل. Clausia مش بيحسبه؛ قوله لـ Clausia لو عايز تسجله.</span>}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11.5px] text-text-4">{sourceText(j.source, cf.documents)}</span>
                {suggested ? <div className="w-full sm:w-64"><JudgmentReview id={j.id} caseId={caseId} /></div> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** Judgments are not in a sheet (their text is shown in full), so the review buttons sit inline. */
function JudgmentReview({ id, caseId }: { id: string; caseId: string }) {
  return <SheetReview table="judgments" id={id} caseId={caseId} />;
}

// ---------- Side column ----------

function NextHearing({ cf, hs, today, caseId, className }: { cf: CaseFile; hs: HearingState; today: string; caseId: string; className: string }) {
  const all = <Link href={`/cases/${caseId}?tab=hearings`} className="shrink-0 text-xs font-semibold hover:underline">كل الجلسات ←</Link>;
  const h = hs.next;
  if (h) {
    const [y, m, d] = h.date.split("-").map(Number);
    const circuit = cf.case.circuit;
    return (
      <div className={`bg-tile-hi rounded-[20px] p-3.5 shadow-[var(--tile-hi-shadow)] lg:rounded-[22px] lg:p-[18px] ${className}`}>
        <div className="flex items-center gap-3 lg:gap-3.5">
          <div className="flex h-[60px] w-[54px] shrink-0 flex-col items-center justify-center rounded-[14px] bg-[image:var(--accent-grad)] leading-none text-[var(--ink-solid)] lg:h-[66px] dark:bg-[var(--ink-solid)] dark:bg-none dark:text-text lg:w-[60px] lg:rounded-[15px]">
            <span className="font-num text-[24px] font-extrabold lg:text-[27px]">{d}</span>
            <span className="mt-1 text-[10px] font-bold lg:mt-[5px] lg:text-[11px] dark:text-gold">{MONTHS[m - 1]}</span>
          </div>
          <div className="min-w-0 flex-1 text-hero">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold opacity-70 lg:text-xs">الجلسة الجاية · {untilLabel(daysBetween(today, h.date))}</span>
              <span className="opacity-80">{all}</span>
            </div>
            <div className="mt-px text-[15px] font-extrabold lg:mt-0.5 lg:text-[16px]">
              <span>{formatDayLabel(h.date).split(" ")[0]} </span><span className="num">{d}/{m}/{y}</span>
              {circuit ? <span className="lg:hidden"> · {circuit}</span> : null}
            </div>
            {circuit ? <div className="mt-0.5 hidden text-[12.5px] opacity-80 lg:block">{circuit}</div> : null}
            {hs.nextNeeded ? <div className="mt-0.5 text-[12px] text-tile-hi-text lg:hidden">المطلوب: {hs.nextNeeded}</div> : null}
          </div>
        </div>
        {hs.nextNeeded ? <div className="mt-3 hidden border-t border-current/15 pt-2.5 text-[13px] font-semibold lg:block">المطلوب: {hs.nextNeeded}</div> : null}
      </div>
    );
  }
  const u = hs.undecided;
  return (
    <div className={`rounded-[20px] border border-border-2 bg-card p-3.5 shadow-soft lg:rounded-[22px] lg:p-[18px] ${className}`}>
      {u ? (
        <div className="flex items-center gap-3 lg:gap-3.5">
          <div className="flex h-[60px] w-[54px] shrink-0 flex-col items-center justify-center rounded-[14px] bg-card-2 leading-none text-text lg:h-[66px] lg:w-[60px] lg:rounded-[15px]">
            <span className="font-num text-[24px] font-extrabold lg:text-[27px]">{Number(u.date.slice(8, 10))}</span>
            <span className="mt-1 text-[10px] font-bold text-text-3 lg:mt-[5px] lg:text-[11px]">{MONTHS[Number(u.date.slice(5, 7)) - 1]}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 text-text-3">
              <span className="text-[11px] font-semibold lg:text-xs">آخر جلسة · {agoLabel(daysBetween(u.date, today))}</span>
              {all}
            </div>
            <div className="mt-0.5 text-[15px] font-extrabold text-text lg:text-[16px]">
              {formatDayLabel(u.date).split(" ")[0]} <span className="num">{formatDmy(u.date)}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <StatusChip tone="warn">لسه من غير قرار</StatusChip>
              <Link href={`/cases/${caseId}?tab=hearings#h-${u.id}`} className="text-[12.5px] font-semibold text-gold-text hover:underline">سجّل القرار</Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[14px] font-bold text-text">مفيش جلسة جاية متسجلة</p>
            <p className="mt-0.5 text-[12.5px] text-text-3">لما يتحدد ميعاد، قوله لـ Clausia.</p>
          </div>
          <span className="text-text-3">{all}</span>
        </div>
      )}
      {u && hs.undecidedNeeded ? <div className="mt-3 border-t border-border-2 pt-2.5 text-[13px] text-text-2">كان المطلوب: {hs.undecidedNeeded}</div> : null}
    </div>
  );
}

function Avatar({ name, ours }: { name: string; ours: boolean }) {
  return (
    <span aria-hidden className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold lg:size-[34px] lg:text-[12px] ${ours ? "mark" : "bg-card-3 text-text-2"}`}>
      {initials(name)}
    </span>
  );
}

function Parties({ cf, caseId, className }: { cf: CaseFile; caseId: string; className: string }) {
  const rows = partyRows(cf.parties, pendingOf<Party>(cf, "case_parties"));
  const line = (name: string, role: string, ours: boolean, extra?: ReactNode) => (
    <span className="flex items-center gap-2.5 py-[9px] lg:py-2.5">
      <Avatar name={name} ours={ours} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-text lg:text-[14.5px]">{name}</span>
        <span className="block text-[11px] text-text-3 lg:text-[12px]">{role}</span>
      </span>
      {extra}
    </span>
  );
  return (
    <section className={`rounded-[20px] border border-border-2 bg-card px-3.5 py-1 shadow-soft lg:px-4 lg:py-1.5 ${className}`} aria-label="الأطراف">
      {rows.length ? (
        <div className="divide-y divide-border-2">
          {rows.map((r, i) => r.id && r.party ? (
            <TapItem key={r.id} id={r.id} title="طرف في الدعوى" className="-mx-2 rounded-lg px-2" row={line(r.name, r.role, r.ours, r.suggested ? <SuggestChip label="مقترح · راجعه" /> : null)}>
              <div className="flex items-center gap-3">
                <Avatar name={r.name} ours={r.ours} />
                <div><p className="text-[17px] font-bold text-text">{r.name}</p><p className="text-[13px] text-text-3">{r.role}</p></div>
              </div>
              {r.party.representative ? <p className="text-[14px] text-text-2">يمثله: {r.party.representative}</p> : null}
              {r.party.notes ? <p className="text-[14px] text-text-2">{r.party.notes}</p> : null}
              <SheetSource cf={cf} item={r.party} />
              {r.suggested ? <SheetReview table="case_parties" id={r.id} caseId={caseId} /> : null}
            </TapItem>
          ) : <div key={`rep-${i}`}>{line(r.name, r.role, false)}</div>)}
        </div>
      ) : (
        <p className="py-3 text-[13.5px] text-text-3">لسه مفيش أطراف متسجلة. قول لـ Clausia مين موكلك ومين الخصم.</p>
      )}
    </section>
  );
}

function Docs({ cf, caseId, className }: { cf: CaseFile; caseId: string; className: string }) {
  const docs = cf.documents;
  const shown = docs.slice(0, 6);
  return (
    <section className={`lg:rounded-[20px] lg:border lg:border-border-2 lg:bg-card lg:px-4 lg:pb-4 lg:pt-3.5 lg:shadow-soft ${className}`}>
      <div className="flex items-baseline justify-between gap-2 px-1 lg:px-0">
        <h2 className="text-[14px] font-bold text-text">المستندات {docs.length ? <span className="font-num text-[12px] font-normal text-text-3">{docs.length}</span> : null}</h2>
        <Link href={`/cases/${caseId}?tab=documents`} className="text-xs font-semibold text-gold-text hover:underline">{docs.length ? "الكل ←" : "أضف مستند ←"}</Link>
      </div>
      {shown.length ? (
        <div className="mt-2.5 grid grid-cols-3 gap-2 lg:mt-3">
          {shown.map((d) => (
            <a key={d.id} href={`/api/documents/${d.id}`} target="_blank" rel="noopener" className="group block min-w-0" title={d.file_name}>
              <span className="flex aspect-[3/4] flex-col gap-1 rounded-[10px] border border-border bg-field px-[7px] py-[9px] shadow-soft transition group-hover:-translate-y-0.5 lg:rounded-[9px] dark:border-transparent dark:bg-text">
                <span className="h-[3px] w-[55%] rounded-sm bg-gold" />
                <span className="mt-[3px] h-0.5 w-full rounded-sm bg-card-3 dark:bg-text-3/50" />
                <span className="h-0.5 w-[88%] rounded-sm bg-card-3 dark:bg-text-3/50" />
                <span className="h-0.5 w-[94%] rounded-sm bg-card-3 dark:bg-text-3/50" />
                {d.read_status !== "done" ? <span className="mt-auto text-center text-[9.5px] text-text-4">{READ_STATUS[d.read_status as keyof typeof READ_STATUS]}</span> : null}
              </span>
              <span className="mt-[5px] line-clamp-2 block text-center text-[11px] font-semibold text-text lg:text-[11.5px]">{docName(d)}</span>
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-2 rounded-[20px] border border-border-2 bg-card px-3.5 py-3 text-[13.5px] leading-6 text-text-3 shadow-soft lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          لسه مفيش مستندات. ارفع صحيفة الدعوى أو أي ورقة بالمشبك تحت، وClausia هيقراها صفحة صفحة.
        </p>
      )}
    </section>
  );
}

// ---------- Page body ----------

export function CaseOverview({ cf, hs, today, caseId, chatHref }: { cf: CaseFile; hs: HearingState; today: string; caseId: string; chatHref: string }) {
  return (
    <div className="mt-4 flex flex-col gap-3 sm:mt-6 lg:flex-row lg:items-start lg:gap-5">
      <div className="contents lg:flex lg:min-w-0 lg:flex-[2_1_520px] lg:flex-col lg:gap-4">
        <Summary cf={cf} hs={hs} today={today} chatHref={chatHref} className="order-1 mb-1 lg:order-none lg:mb-0" />
        <Facts cf={cf} caseId={caseId} className="order-3 lg:order-none" />
        <Sides cf={cf} caseId={caseId} className="order-5 lg:order-none" />
        <Judgments cf={cf} caseId={caseId} className="order-6 lg:order-none" />
        <p className="order-8 px-1 text-xs text-text-4 lg:order-none">
          <Link href={`/cases/${caseId}?tab=details`} className="hover:text-text-2 hover:underline">بيانات الدعوى</Link>
          {" · "}
          <a href={`/api/cases/${caseId}/case-file?download`} className="hover:text-text-2 hover:underline">تنزيل ملف القضية (JSON)</a>
        </p>
      </div>
      <div className="contents lg:flex lg:min-w-0 lg:flex-[1_1_280px] lg:flex-col lg:gap-4">
        <NextHearing cf={cf} hs={hs} today={today} caseId={caseId} className="order-2 lg:order-none" />
        <Parties cf={cf} caseId={caseId} className="order-4 lg:order-none" />
        <Docs cf={cf} caseId={caseId} className="order-7 lg:order-none" />
      </div>
    </div>
  );
}
