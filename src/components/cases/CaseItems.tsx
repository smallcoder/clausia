// The things a dossier tab lists, built from getCaseFile (docs/design/split/Sides*.dc.html, the facts timeline, the parties):
//   Facts + Parties → «الوقائع» (the timeline with the facts date, then the case's people)
//   Sides           → «الطلبات والدفوع» (لنا · طلباتنا / ضدنا · دفوع الخصم, two solid cards)
// Rows show no edit links: tapping an item opens its actions (confirm / reject / edit) in the sheet (ItemSheet).
// Items the chat proposed show in a gold wash with «مستني تأكيدك» (PendingEdits).
import { Check, Shield, Target } from "lucide-react";
import type { ReactNode } from "react";
import { SourceChip } from "@/components/cite/SourceChip";
import { AskTarget } from "@/components/cases/AskTarget";
import { WriteReply } from "@/components/cases/ReplyButton";
import { memoLine, ourSideLabel, replyCount, replyStatus } from "@/components/cases/sides";
import { SheetEditText, SheetReview, TapItem } from "@/components/cases/ItemSheet";
import type { CaseFile } from "@/lib/case-file";
import { formatDmy } from "@/lib/dates";
import type { PendingEdits, PendingRow } from "@/lib/edits";
import { Change, SuggestedTag, WaitingLine } from "@/components/cases/Suggest";
import { aboutItem, citeOf, factDate, partyRows, sourceText } from "@/components/cases/case-view";
import { DateText } from "@/components/ui";

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
  <span className="inline-flex items-center gap-1.25 text-xs font-semibold text-gold-text-small"><span aria-hidden className="size-dot rounded-full bg-gold" />{label}</span>
);


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

// ---------- Facts ----------

function FactRow({ f, last, cf }: { f: Fact; last: boolean; cf: CaseFile }) {
  const suggested = f.review_status === "suggested";
  const cite = citeOf(`item:${f.id}`, f.source, cf.documents, aboutItem("واقعة", `${factDate(f.date, f.date_precision)} · ${f.text}`));
  const dated = f.date && f.date_precision !== "unknown";
  return (
    <span className="flex gap-3.5">
      <span className={`w-16 shrink-0 pt-1 text-sm font-semibold lg:w-19.5 ${dated ? "text-text" : "text-text-4"}`}>
        <DateText value={factDate(f.date, f.date_precision)} />
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
        <span className="w-16 shrink-0 pt-1 text-sm font-semibold text-gold-text-small lg:w-19.5"><DateText value={r.date ?? "غير محدد"} /></span>
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

export function Facts({ cf, caseId, edits }: { cf: CaseFile; caseId: string; edits?: PendingEdits }) {
  const all: TimelineEntry[] = [
    ...[...cf.facts, ...pendingOf<Fact>(cf, "case_facts")].map((f) => ({ sort: f.date && f.date_precision !== "unknown" ? f.date : null, fact: f })),
    ...(edits?.timeline ?? []).filter((r) => r.on !== "hearings").map((r) => ({ sort: r.sortIso, row: r })),
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
          <span className="gold-wash inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs text-gold-text-small">
            تاريخ الوقائع <Change old={fd ? <DateText value={fd} /> : null} next={<DateText value={fdProposed} />} /> <SuggestedTag />
          </span>
        ) : (
          <span className="text-xs text-text-4">تاريخ الوقائع {fd ? <DateText value={fd} /> : "مش محدد"} · بيحدد نسخة القانون</span>
        )}
      </div>
      {all.length ? (
        <div className="px-3 pb-1.5 pt-2.5 lg:px-4">
          {all.map((e, i) => e.row ? <NewFactRow key={e.row.key} r={e.row} last={i === all.length - 1} /> : e.fact && ((f) => (
            <AskTarget key={f.id} item={{ kind: "fact", id: f.id, label: `${factDate(f.date, f.date_precision)} · ${f.text}` }}>
            <TapItem id={f.id} title="واقعة" tight className="rounded-md px-1.5 lg:px-2" row={<FactRow f={f} last={i === all.length - 1} cf={cf} />}>
              <p className="text-sm font-bold text-title"><DateText value={factDate(f.date, f.date_precision)} />{f.date_text && f.date_text !== factDate(f.date, f.date_precision) ? <span className="font-normal text-text-4"> · «<DateText value={f.date_text} />»</span> : null}</p>
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
  <span className="inline-flex items-center gap-1.5 text-sm font-bold text-gold-text-small"><span aria-hidden className="size-1.5 rounded-full bg-gold" />محتاج رد</span>
);
const Replied = () => (
  <span className="inline-flex items-center gap-1.25 text-sm text-text-3"><Check aria-hidden size={13} strokeWidth={2.4} />اترد عليه</span>
);

/** The two cards of the mockup (Sides*): ours (solid ink header, numbered requests) and theirs (thin gold outline, a warm header, a status per defense). */
export function Sides({ cf, caseId, className, edits }: { cf: CaseFile; caseId: string; className: string; edits?: PendingEdits }) {
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
              <div className="font-num text-xl font-extralight text-gold">{needs}<span className="text-md text-text-3"> / {total}</span></div>
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

export function Parties({ cf, caseId, edits }: { cf: CaseFile; caseId: string; edits?: PendingEdits }) {
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

