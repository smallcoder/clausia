"use client";
/**
 * Confirmation card (docs/design/*Chat*.dc.html v2, «ملف قضية جديد»): a solid card with hairline rows, one per op:
 * kind · value (source under it) · a thin gold check that selects it. Only fact rows carry their quote (Naskh,
 * clamped); every row's full verbatim quote is in its expand (tap the row). «احفظ · N» (ink/white, no gold) saves
 * the selected rows and «عدّل» opens every row. The footer shows only that pair, as drawn; the other decisions
 * («احفظ كمقترحات · ارفض الكل · فتح ملف القضية») appear on a quiet second line once «عدّل» has opened the rows
 * (owner decision 2026-10-21). Each row expands to its fields, its source and quote, and ✓ / تعديل / ✗ for that row
 * alone. Nothing is saved without a tap.
 * Mobile (<1024px): the card shows its first rows inline; «عدّل» / «كل العناصر» open it in a bottom sheet.
 * A decided card collapses to one line «اتحفظ N عنصر · افتح الملف» (expandable).
 * Other features render it by passing the proposal object (+ a lookup of uuid → display name, `buildProposalLookup`).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Check, ChevronDown, FolderClosed, X } from "lucide-react";
import { useCite, type CiteSource } from "@/components/cite/context";
import { SourceChip, SourceLabel } from "@/components/cite/SourceChip";
import { Was } from "@/components/cases/Suggest";
import { useUndoToast } from "@/components/shell/UndoToast";
import { cx, DateText } from "@/components/ui";
import { decideProposalAction } from "@/lib/assistant/actions";
import { CASE_STATUS, DECISION, DOC_TYPE, PARTY_ROLE, STAGE } from "@/lib/labels";
import { editsLabel, type EditRow } from "@/lib/edits";
import type { Proposal, ProposalOp } from "@/lib/proposals";
import { relativeDayText } from "@/lib/relative-days";
import { OP_FIELDS, OP_TITLE, type FieldSpec } from "@/lib/tools/registry";

type Edits = Record<string, Record<string, unknown>>;
type Mode = "confirm" | "suggest" | "reject";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const open = (s: ProposalOp["status"]) => s === "pending" || s === "failed";
/** rows shown inline on mobile before «كل العناصر» opens the sheet */
const MOBILE_ROWS = 5;

/** «3 عناصر», Arabic count agreement */
export const itemsLabel = (n: number) => (n === 1 ? "عنصر واحد" : n === 2 ? "عنصرين" : n <= 10 ? `${n} عناصر` : `${n} عنصر`);

function opName(o: ProposalOp): string {
  const a = o.args as Record<string, string | number | undefined>;
  if (a.name) return String(a.name);
  if (a.case_number) return `الدعوى رقم ${a.case_number}${a.case_year ? ` لسنة ${a.case_year}` : ""}`;
  if (a.title) return String(a.title);
  if (o.tool === "add_hearing" && a.date) return `جلسة ${a.date}`;
  return OP_TITLE[o.tool];
}

/** A «مش مذكور» cell has no quote and no paper sentence: nothing to verify and nothing to open. (Only this tool: every other op needs its quote.) */
const noQuoteByDesign = (o: ProposalOp) => o.tool === "add_doc_cell" && !o.args.answer;

/** The short label in the row's first column (the mockup's «الموكلة / الدعوى / الخصم / واقعة / الطلبات»). */
function kindOf(o: ProposalOp): string {
  const a = o.args as Record<string, unknown>;
  switch (o.tool) {
    case "create_client": return "الموكل";
    case "create_case": return "الدعوى";
    case "update_case": return "تعديل الدعوى";
    case "add_party":
      if (a.is_our_client) return "موكلنا";
      return ["witness", "expert", "guarantor", "other"].includes(String(a.role)) ? (PARTY_ROLE[a.role as keyof typeof PARTY_ROLE] ?? "طرف") : "الخصم";
    case "add_fact": return "واقعة";
    case "add_request": return "طلب";
    case "add_argument": return "دفع";
    case "add_hearing": return "جلسة";
    case "set_hearing_location": return "المكان";
    case "record_decision": return "قرار";
    case "add_judgment": return "حكم";
    case "attach_document": return "ورقة";
    case "add_doc_column": return "عمود";
    case "add_doc_cell": return "خانة";
    case "add_deadline": return "ميعاد طعن"; // drawn by DeadlineCard
  }
}

function summaryOf(o: ProposalOp, lookup: Record<string, string> = {}): string {
  const a = o.args as Record<string, string | number | boolean | undefined>;
  const cut = (s: unknown, n = 70) => { const t = String(s ?? ""); return t.length > n ? `${t.slice(0, n)}…` : t; };
  switch (o.tool) {
    case "create_client": return [a.name, a.phone].filter(Boolean).join(" · ");
    case "create_case": case "update_case": return [a.case_number && `رقم ${a.case_number}${a.case_year ? ` لسنة ${a.case_year}` : ""}`, a.title, a.court, a.circuit, a.status && CASE_STATUS[a.status as keyof typeof CASE_STATUS], a.stage && a.stage !== "first_instance" && STAGE[a.stage as keyof typeof STAGE]].filter(Boolean).join(" · ");
    case "add_party": return [a.name, a.role && PARTY_ROLE[a.role as keyof typeof PARTY_ROLE]].filter(Boolean).join(" · ");
    case "add_fact": return [a.date_text ?? a.date ?? "بدون تاريخ", cut(a.text)].join(" · ");
    case "add_request": case "add_argument": return cut(a.text, 90);
    case "add_hearing": return [a.date, a.purpose, a.location].filter(Boolean).join(" · ");
    case "set_hearing_location": return String(a.location ?? "");
    case "record_decision": return [a.decision && DECISION[a.decision as keyof typeof DECISION], a.next_date && `الجلسة القادمة ${a.next_date}`].filter(Boolean).join(" · ");
    case "add_judgment": return [a.date, cut(a.operative_text)].filter(Boolean).join(" · ");
    case "attach_document": return a.doc_type ? DOC_TYPE[a.doc_type as keyof typeof DOC_TYPE] : "";
    case "add_doc_column": return String(a.title ?? "");
    case "add_doc_cell": return [lookup[String(a.document)], a.answer ? cut(a.answer, 90) : "مش مذكور"].filter(Boolean).join(" · ");
    case "add_deadline": return "ميعاد طعن";
  }
}

/**
 * «بكرة = الخميس 22/10/2026» for each date the code worked out from the lawyer's words (op.resolved_from), so the
 * lawyer confirms the day here. A field the lawyer has changed in the card loses its note at once.
 */
function relativeNotes(o: ProposalOp, values: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, r] of Object.entries(o.resolved_from ?? {})) if (values[k] === o.args[k]) out[k] = relativeDayText(r);
  return out;
}

/** The new items the case page shows as a row waiting for the lawyer (the other ops of an «edit» card). */
const PAGE_ADDS = ["add_fact", "add_hearing", "add_party", "add_request", "add_argument"];

function titleOf(p: Proposal, edit = false): string {
  if (edit) return "هعدّل في القضية دي";
  const has = (t: ProposalOp["tool"]) => p.ops.some((o) => o.tool === t);
  if (has("create_case")) return "ملف قضية جديد";
  if (has("create_client")) return "موكل جديد";
  if (has("record_decision")) return "قرار الجلسة";
  if (has("add_doc_column")) return "عمود جديد في جدول المستندات";
  if (p.case_id) return "إضافات لملف القضية";
  return "بطاقة تأكيد";
}

export function ProposalCard({ proposal: initial, lookup = {}, rows = {} }: {
  proposal: Proposal; lookup?: Record<string, string>;
  /** «old ← new» lines of the change ops (src/lib/edits.ts), by `proposalId:opId`; worked out on the server from what is saved now */
  rows?: Record<string, EditRow[]>;
}) {
  const router = useRouter();
  const undoToast = useUndoToast();
  const [p, setP] = useState(initial);
  const [edits, setEdits] = useState<Edits>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial.ops.filter((o) => open(o.status)).map((o) => o.op_id)));
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [sheet, setSheet] = useState(false);
  const [showDecided, setShowDecided] = useState(false);
  /** «عدّل» was tapped: every open row is open and the footer's second line (the other decisions) shows */
  const [more, setMore] = useState(false);
  const { active } = useCite();

  // resync with a fresh prop after router.refresh() (card decided in another tab or by another feature);
  // keyed on the statuses so a local decision that the server already reflects is not thrown away
  const sig = `${initial.id}:${initial.status}:${initial.ops.map((o) => o.status).join(",")}`;
  const [seenSig, setSeenSig] = useState(sig);
  if (sig !== seenSig) {
    setSeenSig(sig);
    setP(initial);
    setSelected((s) => new Set(initial.ops.filter((o) => open(o.status) && s.has(o.op_id)).map((o) => o.op_id)));
  }

  const openOps = p.ops.filter((o) => open(o.status));
  const chosen = openOps.filter((o) => selected.has(o.op_id));
  const createdCase = p.ops.find((o) => o.tool === "create_case" && o.result_id && (o.status === "confirmed" || o.status === "suggested"));
  const caseLink = createdCase?.result_id ?? (p.status !== "pending" ? p.case_id : null);
  const newCase = p.ops.some((o) => o.tool === "create_case");
  // an «edit» card: changes to what is saved (old ← new) and new rows, all of which the case page shows too
  const rowsOf = (o: ProposalOp) => rows[`${p.id}:${o.op_id}`] ?? [];
  const editCard = !!p.case_id && openOps.some((o) => rowsOf(o).length > 0) && openOps.every((o) => rowsOf(o).length > 0 || PAGE_ADDS.includes(o.tool));
  const editCount = chosen.reduce((n, o) => n + (rowsOf(o).length || 1), 0);
  const pageHref = p.case_id ? `/cases/${p.case_id}?sheet=1${p.thread_id ? `&s=${p.thread_id}` : ""}` : null;

  function decide(mode: Mode, opIds: string[]) {
    if (!opIds.length) return;
    setError(null);
    const ed: Edits = {};
    for (const id of opIds) if (edits[id]) ed[id] = edits[id];
    start(async () => {
      const r = await decideProposalAction(p.id, { mode, opIds, edits: mode === "reject" ? undefined : ed });
      if (!r.ok || !r.proposal) { setError(r.error ?? "تعذّر الحفظ"); return; }
      // a confirm that can be reverted: the toast with «تراجع» (10 seconds)
      if (r.undoEventId) undoToast.show({ eventIds: [r.undoEventId], count: p.ops.filter((o) => opIds.includes(o.op_id)).reduce((n, o) => n + (rowsOf(o).length || 1), 0) });
      setP(r.proposal);
      setEditing(null);
      router.refresh();
    });
  }

  /** The ops of this card that `o` points at with «@ref» and that are not saved yet. */
  function depsOf(o: ProposalOp): ProposalOp[] {
    const out: ProposalOp[] = [];
    for (const f of OP_FIELDS[o.tool]) {
      const v = o.args[f.key];
      if (f.type !== "ref" || typeof v !== "string" || !v.startsWith("@")) continue;
      const target = p.ops.find((x) => x.args.ref === v.slice(1));
      if (target && !target.result_id) out.push(target);
    }
    return out;
  }

  /** Why saving this op alone cannot work yet: an «@ref» it points at (in this card) is not saved. */
  function blockedBy(o: ProposalOp, inSelection = false): string | null {
    for (const t of depsOf(o)) {
      if (t.status === "rejected") return `العنصر المرتبط (${opName(t)}) مرفوض`;
      if (!inSelection || !selected.has(t.op_id)) return `أكّد العنصر المرتبط أولًا: ${opName(t)}`;
    }
    return null;
  }

  /** Select an op together with what it needs; unselect it together with what needs it. */
  function toggleSelect(o: ProposalOp) {
    setSelected((cur) => {
      const n = new Set(cur);
      if (n.has(o.op_id)) {
        const drop = (x: ProposalOp) => {
          n.delete(x.op_id);
          for (const y of p.ops) if (n.has(y.op_id) && depsOf(y).some((d) => d.op_id === x.op_id)) drop(y);
        };
        drop(o);
      } else {
        const add = (x: ProposalOp) => {
          if (!open(x.status)) return;
          n.add(x.op_id);
          for (const d of depsOf(x)) if (!n.has(d.op_id)) add(d);
        };
        add(o);
      }
      return n;
    });
  }

  const showSheet = sheet && openOps.length > 0;
  useEffect(() => {
    if (!showSheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeSheet(); };
    const mq = window.matchMedia("(min-width: 1024px)");
    const onMq = () => { if (mq.matches) setSheet(false); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); mq.removeEventListener("change", onMq); };
  }, [showSheet]);

  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  /** «عدّل» opens every open row and the footer's second line; «اقفل» closes both. On mobile it opens the sheet. */
  function editSomething(mobile: boolean) {
    const on = mobile || !more;
    setMore(on);
    setExpanded(on ? new Set(openOps.map((o) => o.op_id)) : new Set());
    if (mobile) setSheet(true);
  }
  /** closing the sheet ends «عدّل» (the inline card on mobile keeps the mockup's footer) */
  function closeSheet() {
    setSheet(false);
    setMore(false);
  }

  function display(f: FieldSpec, v: unknown): string | null {
    if (v === undefined || v === null || v === "") return null;
    if (f.type === "bool") return v ? "نعم" : "لا";
    if (typeof f.type === "object") return f.type.enum[String(v)] ?? String(v);
    if (f.type === "ref") {
      const s = String(v);
      if (s.startsWith("@")) {
        const target = p.ops.find((x) => x.args.ref === s.slice(1));
        return `(من هذه البطاقة) ${target ? opName(target) : s}`;
      }
      return lookup[s] ?? (UUID.test(s) ? "عنصر محفوظ" : s);
    }
    return String(v);
  }

  /** The chip of a paper source: where the panel opens (page, stored span, the quote for an older item without one). */
  function citeOf(o: ProposalOp, values: Record<string, unknown>): CiteSource | null {
    if (o.source.kind !== "document" || !o.source.document_id) return null;
    if (noQuoteByDesign(o)) return null; // «مش مذكور»: there is no sentence to open, the row names the paper only
    return {
      id: `card:${p.id}:${o.op_id}`, documentId: o.source.document_id, page: o.source.page ?? 1,
      start: o.source.char_start ?? null, end: o.source.char_end ?? null, quote: o.source.quote ?? null,
      label: sourceShort(o), about: [kindOf(o), summaryOf({ ...o, args: values }, lookup)].filter(Boolean).join(" · "),
    };
  }
  /** The source column: «من رسالتك» / «صحيفة دعوى ص 2» */
  function sourceShort(o: ProposalOp): string {
    if (o.tool === "add_doc_column") return "سؤالك";
    if (o.source.kind !== "document") return "من رسالتك";
    const name = (o.source.document_id && lookup[o.source.document_id]) || "الورقة";
    return `${name}${o.source.page ? ` · ص ${o.source.page}` : ""}`;
  }
  function sourceLong(o: ProposalOp): string {
    if (o.tool === "add_doc_column") return "من سؤالك على صفحة المستندات";
    if (o.source.kind !== "document") return "من رسالتك في المحادثة";
    const name = (o.source.document_id && lookup[o.source.document_id]) || "مستند";
    return `من الورقة: ${name}${o.source.page ? ` — صفحة ${o.source.page}` : ""}`;
  }

  /** quiet outline pill (the mockup's «عدّل»); per-row secondary actions use it too */
  const btn2 = "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border-2 px-4.5 text-base font-medium glass-icon transition hover:text-text disabled:opacity-50";
  /** text-only actions on the card's second footer line (save as suggestions, reject all) */
  const quiet = "inline-flex min-h-11 items-center rounded-full px-3 text-sm text-text-3 transition hover:text-text disabled:opacity-50";

  const card = (inSheet: boolean) => {
    const limit = !inSheet && p.ops.length > MOBILE_ROWS + 1 && openOps.length > 0;
    return (
      <div className={cx("bg-card", inSheet
        ? "flex max-h-[88dvh] flex-col rounded-t-xl border-t border-border-2 shadow-pop" // ds-allow: dvh: the sheet is at most 88% of the visible screen
        : "overflow-hidden rounded-xl border border-border-2 shadow-card")}>
        {inSheet ? <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-card-3" /> : null}
        <div className="flex shrink-0 items-center gap-3 border-b border-border-2 px-4 py-4 sm:px-5.5">
          <span className="mark inline-flex size-9 shrink-0 items-center justify-center rounded-md">
            <FolderClosed aria-hidden size={18} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <p id={inSheet ? `sheet-title-${p.id}` : undefined} className="text-md font-bold leading-[normal] text-title">{titleOf(p, editCard)}</p>
            <p className="mt-0.5 text-xs leading-[normal] text-text-3">
              {openOps.length ? <><span className="font-num">{itemsLabel(p.ops.length)}</span> · مش هيتحفظ حاجة قبل ما تأكد</> : decisionSummary(p)}
            </p>
          </div>
          {inSheet ? (
            <button type="button" onClick={closeSheet} aria-label="إغلاق" className="-me-2 flex size-11 items-center justify-center rounded-full text-text-3 hover:bg-card-2">
              <X aria-hidden size={20} strokeWidth={1.8} />
            </button>
          ) : null}
        </div>

        <ul className={cx(inSheet && "min-h-0 flex-1 overflow-y-auto overscroll-contain")}>
          {p.ops.map((o, i) => {
            const isOpen = expanded.has(o.op_id);
            const isEditing = editing === o.op_id;
            const merged = { ...o.args, ...(edits[o.op_id] ?? {}) };
            const notes = relativeNotes(o, merged);
            const live = open(o.status);
            const lone = live ? blockedBy(o) : null;
            const hard = live ? blockedBy(o, true) : null;
            const sel = selected.has(o.op_id);
            // only fact rows show their quote (clamped); the rest keep it in the expand
            const factQuote = o.tool === "add_fact" && o.source.kind === "document" ? o.source.quote : null;
            const tagList = [
              edits[o.op_id] || o.edited ? <Tag key="e" tone="neutral">معدّل</Tag> : null,
              !o.quote_verified && !noQuoteByDesign(o) && live ? <Tag key="q" tone="warn">راجع المصدر</Tag> : null,
              o.status === "suggested" ? <Tag key="s" tone="warn">مقترح</Tag> : null,
              o.status === "failed" ? <Tag key="f" tone="bad">ما اتحفظش</Tag> : null,
            ].filter(Boolean);
            const tags = tagList.length ? tagList : null;
            const cite = citeOf(o, merged);
            return (
              <li key={o.op_id} className={cx("not-first:border-t not-first:border-border-2", o.status === "rejected" && "opacity-55", limit && i >= MOBILE_ROWS && "lg:block hidden", cite && active?.id === cite.id && "bg-gold-bg")}>
                {/* kind · value (+ fact quote) · source · check — the mockup's hairline row */}
                <div className="flex items-start gap-3.5 px-4 py-3.25 sm:px-5.5">
                  {live && rowsOf(o).length ? null : <span className="w-14.5 shrink-0 pt-0.5 text-xs leading-[normal] text-text-4 sm:w-18">{kindOf(o)}</span>}
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => toggle(o.op_id)} aria-expanded={isOpen} title={isOpen ? "اقفل التفاصيل" : "اعرض التفاصيل"} className="block w-full text-start">
                      {live && rowsOf(o).length ? (
                        /* the mockup's lines: the field's name, then «old (struck) ← new (gold)»; a value with no old is plain */
                        <span className="block space-y-1.5">
                          {rowsOf(o).map((r) => (
                            <span key={r.key} className="block">
                              <span className="block text-sm leading-[1.5] text-text-3">{r.label}</span>
                              <span className="block text-base font-semibold leading-[1.5] text-text">
                                {r.old ? <><Was>{r.old}</Was> <span aria-hidden className="font-normal text-text-3">←</span> <b className="font-bold text-gold">{r.new}</b></> : r.new}
                              </span>
                            </span>
                          ))}
                        </span>
                      ) : (
                      <span className={cx("block text-base font-semibold leading-[1.5] text-text", !isOpen && "line-clamp-2")}>
                        {summaryOf({ ...o, args: merged }, lookup) || OP_TITLE[o.tool]}
                      </span>)}
                      {factQuote && !isOpen ? <span className="text-doc mt-0.75 line-clamp-2 block text-sm leading-[1.8]! text-text-3">«{factQuote}»</span> : null}
                      {!isOpen ? Object.entries(notes).map(([k, n]) => <span key={k} className="mt-0.75 block text-sm font-semibold leading-[normal] text-text-2">{n}</span>) : null}
                    </button>
                    {/* the source chip is its own button (never inside the row's expand button): a paper source opens the panel */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      {cite ? <SourceChip cite={cite} /> : <SourceLabel>{sourceShort(o)}</SourceLabel>}
                      {tags}
                    </div>
                  </div>
                  {live ? (
                    <button type="button" role="checkbox" aria-checked={sel} aria-label={sel ? `شيل ${kindOf(o)} من الحفظ` : `ضيف ${kindOf(o)} للحفظ`}
                      onClick={() => toggleSelect(o)} disabled={pending || (!sel && !!lone && lone.includes("مرفوض"))}
                      className={cx("tap mt-0.5 inline-flex size-tick shrink-0 items-center justify-center rounded-full border transition disabled:opacity-40",
                        sel ? "border-gold-edge text-gold" : "border-border text-transparent hover:text-text-4")}>
                      <Check aria-hidden size={12} strokeWidth={2.6} />
                    </button>
                  ) : (
                    <span aria-label={o.status === "rejected" ? "مرفوض" : o.status === "suggested" ? "اتحفظ كمقترح" : "اتحفظ"}
                      className={cx("mt-0.5 inline-flex size-tick shrink-0 items-center justify-center rounded-full",
                        o.status === "rejected" ? "bg-card-2 text-text-4" : o.status === "suggested" ? "bg-gold-bg text-gold" : "bg-good-bg text-good")}>
                      {o.status === "rejected" ? <X aria-hidden size={12} strokeWidth={2.6} /> : <Check aria-hidden size={12} strokeWidth={2.6} />}
                    </span>
                  )}
                </div>

                {isOpen ? (
                  <div className="space-y-3 px-4 pb-4 sm:pe-5.5 sm:ps-27">
                    {isEditing ? (
                      <EditFields op={o} values={merged} notes={notes} onChange={(k, v) => setEdits((e) => ({ ...e, [o.op_id]: { ...(e[o.op_id] ?? {}), [k]: v } }))} display={display} />
                    ) : (
                      <dl className="grid grid-cols-[minmax(4.5rem,7.5rem)_1fr] gap-x-4 gap-y-1.5 text-base">
                        {OP_FIELDS[o.tool].map((f) => {
                          const v = display(f, merged[f.key]);
                          return v === null ? null : (
                            <div key={f.key} className="contents">
                              <dt className="text-text-3">{f.label}</dt>
                              <dd className="min-w-0 break-words text-text">
                                {f.type === "date" ? <DateText value={String(v)} /> : f.type === "number" ? <span className="num">{v}</span> : v}
                                {notes[f.key] ? <span className="mt-0.5 block text-sm font-semibold text-text-2">{notes[f.key]}</span> : null}
                              </dd>
                            </div>
                          );
                        })}
                      </dl>
                    )}

                    <div className="rounded-md border border-border-2 bg-card-2 px-3.5 py-2.5">
                      <p className="text-xs text-text-3">{sourceLong(o)}</p>
                      {o.source.quote ? <p className="text-doc mt-1 text-md text-text">«{o.source.quote}»</p> : <p className="mt-1 text-sm leading-4 text-text-4">{o.tool === "add_doc_cell" ? "الورقة مش بتذكر ده" : "بدون اقتباس"}</p>}
                      {!o.quote_verified && !noQuoteByDesign(o) ? <p className="mt-1.5 text-sm leading-4 font-medium text-gold">ما لقيتش النص ده في المصدر، راجعه</p> : null}
                    </div>

                    {o.status === "failed" && o.error ? <p className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad">{o.error}</p> : null}
                    {o.result_id && o.tool === "create_case" ? <Link href={`/cases/${o.result_id}`} className="inline-flex min-h-11 items-center text-base font-semibold text-text hover:underline">فتح ملف القضية ←</Link> : null}

                    {live ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" disabled={pending || !!lone} title={lone ?? undefined} onClick={() => decide("confirm", [o.op_id])}
                          className="bg-primary-fill inline-flex h-11 items-center gap-1.5 rounded-full px-4.5 text-base font-bold transition disabled:opacity-50">
                          <Check aria-hidden size={15} strokeWidth={2.6} />احفظ ده
                        </button>
                        <button type="button" disabled={pending} onClick={() => setEditing(isEditing ? null : o.op_id)} className={btn2}>
                          {isEditing ? "خلّصت التعديل" : "تعديل"}
                        </button>
                        <button type="button" disabled={pending} onClick={() => decide("reject", [o.op_id])}
                          className={cx(quiet, "gap-1 text-sm hover:text-bad")}>
                          <X aria-hidden size={15} strokeWidth={2.4} />ارفض
                        </button>
                        {lone ? <p className="basis-full text-sm leading-4 text-text-4">{lone}</p> : null}
                      </div>
                    ) : null}
                    {live && sel && hard ? <p className="text-sm leading-4 text-text-4">{hard}</p> : null}
                  </div>
                ) : null}
              </li>
            );
          })}
          {limit ? (
            <li className="border-t border-border-2 lg:hidden">
              <button type="button" onClick={() => setSheet(true)} aria-haspopup="dialog"
                className="flex min-h-11 w-full items-center justify-center gap-1 px-4 py-3 text-sm font-semibold text-text-2 hover:text-text">
                كل العناصر · <span className="font-num">{itemsLabel(p.ops.length)}</span>
              </button>
            </li>
          ) : null}
        </ul>

        {error ? <p className="mx-4 mt-3 shrink-0 rounded-md bg-bad-bg px-3 py-2 text-base text-bad sm:mx-5.5">{error}</p> : null}

        <div className={cx("shrink-0 border-t border-border-2 px-4 pt-3.5 sm:px-5.5", openOps.length && more ? "pb-2" : "pb-4",
          inSheet && (openOps.length && more ? "pb-[calc(0.5rem+env(safe-area-inset-bottom))]" : "pb-[calc(1rem+env(safe-area-inset-bottom))]")) /* ds-allow: safe-area inset needs calc() */}>
          {openOps.length ? (
            <>
              <div className="flex gap-2">
                <button type="button" disabled={pending || !chosen.length} onClick={() => decide("confirm", chosen.map((o) => o.op_id))}
                  className="bg-primary-fill h-11 min-w-0 flex-1 truncate rounded-full px-5 text-base font-bold transition disabled:opacity-50">
                  {pending ? "بحفظ…" : editCard ? <>أكّد · <span className="font-num">{editsLabel(editCount)}</span></> : <>{newCase ? "احفظ الملف" : "احفظ"} · <span className="font-num">{itemsLabel(chosen.length)}</span></>}
                </button>
                {/* mobile: opens the sheet with every open row expanded; desktop (and inside the sheet): expands / collapses the rows */}
                {/* an edit card on a phone / tablet (the page opens as a sheet, below 1280): «شوف في الصفحة» — the highlights */}
                {editCard && !inSheet && pageHref ? <Link href={pageHref} className={cx(btn2, "xl:hidden")}>شوف في الصفحة</Link> : null}
                <button type="button" disabled={pending}
                  onClick={() => editSomething(!inSheet && !window.matchMedia("(min-width: 1024px)").matches)} className={cx(btn2, editCard && !inSheet && "max-xl:hidden")}>
                  {inSheet ? (more ? "اقفل" : "عدّل") : (
                    <><span className="lg:hidden">عدّل</span><span className="hidden lg:inline">{more ? "اقفل" : "عدّل"}</span></>
                  )}
                </button>
              </div>
              {/* the other decisions: a quiet second line, only once «عدّل» has opened the rows (owner decision);
                  before that the footer is the mockup's pair alone */}
              {more ? <div className="mt-1 flex flex-wrap items-center justify-center gap-x-1">
                <button type="button" disabled={pending || !chosen.length} onClick={() => decide("suggest", chosen.map((o) => o.op_id))} className={quiet}>احفظ كمقترحات</button>
                <span aria-hidden className="text-text-4">·</span>
                <button type="button" disabled={pending} onClick={() => decide("reject", openOps.map((o) => o.op_id))} className={cx(quiet, "hover:text-bad")}>ارفض الكل</button>
                {caseLink ? <><span aria-hidden className="text-text-4">·</span><Link href={`/cases/${caseLink}`} className={cx(quiet, "font-semibold text-text-2")}>فتح ملف القضية ←</Link></> : null}
              </div> : null}
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-base text-text-2">{decisionSummary(p)}</p>
              {caseLink ? <Link href={`/cases/${caseLink}`} className="inline-flex min-h-11 items-center text-base font-semibold text-text hover:underline">فتح ملف القضية ←</Link> : null}
            </div>
          )}
        </div>
      </div>
    );
  };

  // a decided card collapses to one line: «اتحفظ N عنصر · افتح الملف» (tap the words to expand it again)
  if (!openOps.length && !showDecided) {
    const saved = p.ops.filter((o) => o.status === "confirmed" || o.status === "suggested").length;
    return (
      <div className="flex min-h-13 items-center gap-2.5 rounded-lg border border-border-2 bg-card py-1 pe-2 ps-4 text-base shadow-soft">
        <span aria-hidden className="inline-flex size-tick shrink-0 items-center justify-center rounded-full bg-good-bg text-good"><Check size={12} strokeWidth={2.6} /></span>
        <button type="button" onClick={() => setShowDecided(true)} aria-expanded={false} title="اعرض التفاصيل"
          className="inline-flex min-h-11 min-w-0 flex-1 items-center gap-1.5 text-start font-semibold text-text hover:text-title">
          <span className="truncate">{saved ? <>اتحفظ <span className="font-num">{saved}</span> {saved === 1 ? "عنصر" : saved === 2 ? "عنصرين" : saved <= 10 ? "عناصر" : "عنصر"}</> : decisionSummary(p)}</span>
          <ChevronDown aria-hidden size={14} strokeWidth={2} className="shrink-0 text-text-4" />
          <span className="sr-only">اعرض التفاصيل</span>
        </button>
        {caseLink ? <Link href={`/cases/${caseLink}`} className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 font-semibold text-text-2 hover:text-text">افتح الملف ←</Link> : null}
      </div>
    );
  }

  return (
    <>
      {!openOps.length ? (
        <button type="button" onClick={() => setShowDecided(false)} className="mb-1.5 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-text-3 hover:text-text">
          <ChevronDown aria-hidden size={14} strokeWidth={2} className="rotate-180" />اطوِ البطاقة
        </button>
      ) : null}
      {card(false)}
      {showSheet ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden" role="dialog" aria-modal="true" aria-labelledby={`sheet-title-${p.id}`}>
          <button type="button" aria-label="إغلاق" tabIndex={-1} onClick={closeSheet} className="fade-enter absolute inset-0 bg-backdrop" />
          <div className="sheet-enter relative">{card(true)}</div>
        </div>
      ) : null}
    </>
  );
}

function Tag({ tone, children }: { tone: "neutral" | "warn" | "bad"; children: React.ReactNode }) {
  // v2 status: a small dot + a word (gold = needs the lawyer, red = failed, muted = info)
  const [dot, txt] = { neutral: ["bg-text-4", "text-text-3"], warn: ["bg-gold", "text-gold"], bad: ["bg-bad", "text-bad"] }[tone];
  return <span className={cx("inline-flex items-center gap-1 text-xs font-semibold leading-[18px]", txt)}><span aria-hidden className={cx("size-1.5 rounded-full", dot)} />{children}</span>;
}

function decisionSummary(p: Proposal) {
  const n = (s: ProposalOp["status"]) => p.ops.filter((o) => o.status === s).length;
  const parts = [n("confirmed") && `اتحفظ ${n("confirmed")}`, n("suggested") && `مقترح ${n("suggested")}`, n("rejected") && `مرفوض ${n("rejected")}`, n("failed") && `ما اتحفظش ${n("failed")}`].filter(Boolean);
  return parts.join(" · ") || "—";
}

function EditFields({ op, values, notes, onChange, display }: {
  op: ProposalOp; values: Record<string, unknown>; notes: Record<string, string>; onChange: (k: string, v: unknown) => void; display: (f: FieldSpec, v: unknown) => string | null;
}) {
  const input = "min-h-11 w-full rounded-md border border-border bg-field px-3 py-2 text-md text-text";
  return (
    <div className="space-y-2.5">
      {OP_FIELDS[op.tool].map((field) => {
        // the answer of a «مش مذكور» cell is not editable: an answer needs a quote, and the cell has none
        const f: FieldSpec = op.tool === "add_doc_cell" && field.key === "answer" && !op.args.answer ? { ...field, type: "readonly" } : field;
        const v = values[f.key];
        const id = `${op.op_id}-${f.key}`;
        let control;
        if (f.type === "ref" || f.type === "readonly") control = <p className="py-1 text-base leading-5 text-text-2">{display(f, v) ?? "—"}</p>;
        else if (f.type === "bool") control = <input id={id} type="checkbox" checked={!!v} onChange={(e) => onChange(f.key, e.target.checked)} className="h-4 w-4 accent-primary" />;
        else if (typeof f.type === "object") {
          control = (
            <select id={id} value={String(v ?? "")} onChange={(e) => onChange(f.key, e.target.value || undefined)} className={input}>
              <option value="">—</option>
              {Object.entries(f.type.enum).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          );
        } else if (f.type === "longtext") control = <textarea id={id} rows={3} value={String(v ?? "")} onChange={(e) => onChange(f.key, e.target.value || undefined)} className={input} />;
        else {
          control = (
            <input id={id} value={String(v ?? "")} inputMode={f.type === "number" ? "numeric" : undefined} dir={f.type === "date" || f.type === "number" ? "ltr" : undefined}
              placeholder={f.type === "date" ? "يوم/شهر/سنة" : undefined}
              onChange={(e) => onChange(f.key, e.target.value === "" ? undefined : f.type === "number" ? Number(e.target.value) || e.target.value : e.target.value)}
              className={cx(input, (f.type === "date" || f.type === "number") && "num text-right")} />
          );
        }
        return (
          <div key={f.key} className={cx(f.type === "bool" && "flex items-center gap-2")}>
            <label htmlFor={id} className={cx("text-sm leading-4 text-text-3", f.type !== "bool" && "mb-1 block")}>{f.label}</label>
            {control}
            {notes[f.key] ? <p className="mt-1 text-sm leading-4 text-text-3">{notes[f.key]}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
