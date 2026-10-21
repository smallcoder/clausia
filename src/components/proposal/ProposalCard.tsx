"use client";
/**
 * Confirmation card (docs/design/*Chat*.dc.html v2, «ملف قضية جديد»): a solid card with hairline rows, one per op:
 * kind · value (source under it) · a thin gold check that selects it. Only fact rows carry their quote (Naskh,
 * clamped); every row's full verbatim quote is in its expand (tap the row). At rest the footer is exactly the
 * mockup's pair: «احفظ · N» (ink/white, no gold) saves the selected rows, «عدّل» opens every row; with the rows open
 * (and in the mobile sheet) «احفظ كمقترحات» / «ارفض الكل» sit quietly under the pair. Each row expands to its
 * fields, its source and quote, and ✓ / تعديل / ✗ for that row alone. Nothing is saved without a tap.
 * Mobile (<1024px): the card shows its first rows inline; «عدّل» / «كل العناصر» open it in a bottom sheet.
 * A decided card collapses to one line «اتحفظ N عنصر · افتح الملف» (expandable).
 * Other features render it by passing the proposal object (+ a lookup of uuid → display name, `buildProposalLookup`).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Check, ChevronDown, FolderClosed, X } from "lucide-react";
import { cx } from "@/components/ui";
import { decideProposalAction } from "@/lib/assistant/actions";
import { CASE_STATUS, DECISION, DOC_TYPE, PARTY_ROLE, STAGE } from "@/lib/labels";
import type { Proposal, ProposalOp } from "@/lib/proposals";
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
    case "record_decision": return "قرار";
    case "add_judgment": return "حكم";
    case "attach_document": return "ورقة";
  }
}

function summaryOf(o: ProposalOp): string {
  const a = o.args as Record<string, string | number | boolean | undefined>;
  const cut = (s: unknown, n = 70) => { const t = String(s ?? ""); return t.length > n ? `${t.slice(0, n)}…` : t; };
  switch (o.tool) {
    case "create_client": return [a.name, a.phone].filter(Boolean).join(" · ");
    case "create_case": case "update_case": return [a.case_number && `رقم ${a.case_number}${a.case_year ? ` لسنة ${a.case_year}` : ""}`, a.title, a.court, a.circuit, a.status && CASE_STATUS[a.status as keyof typeof CASE_STATUS], a.stage && a.stage !== "first_instance" && STAGE[a.stage as keyof typeof STAGE]].filter(Boolean).join(" · ");
    case "add_party": return [a.name, a.role && PARTY_ROLE[a.role as keyof typeof PARTY_ROLE]].filter(Boolean).join(" · ");
    case "add_fact": return [a.date_text ?? a.date ?? "بدون تاريخ", cut(a.text)].join(" · ");
    case "add_request": case "add_argument": return cut(a.text, 90);
    case "add_hearing": return [a.date, a.purpose].filter(Boolean).join(" · ");
    case "record_decision": return [a.decision && DECISION[a.decision as keyof typeof DECISION], a.next_date && `الجلسة القادمة ${a.next_date}`].filter(Boolean).join(" · ");
    case "add_judgment": return [a.date, cut(a.operative_text)].filter(Boolean).join(" · ");
    case "attach_document": return a.doc_type ? DOC_TYPE[a.doc_type as keyof typeof DOC_TYPE] : "";
  }
}

function titleOf(p: Proposal): string {
  const has = (t: ProposalOp["tool"]) => p.ops.some((o) => o.tool === t);
  if (has("create_case")) return "ملف قضية جديد";
  if (has("create_client")) return "موكل جديد";
  if (has("record_decision")) return "قرار الجلسة";
  if (p.case_id) return "إضافات لملف القضية";
  return "بطاقة تأكيد";
}

export function ProposalCard({ proposal: initial, lookup = {} }: { proposal: Proposal; lookup?: Record<string, string> }) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [edits, setEdits] = useState<Edits>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial.ops.filter((o) => open(o.status)).map((o) => o.op_id)));
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [sheet, setSheet] = useState(false);
  const [showDecided, setShowDecided] = useState(false);

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

  function decide(mode: Mode, opIds: string[]) {
    if (!opIds.length) return;
    setError(null);
    const ed: Edits = {};
    for (const id of opIds) if (edits[id]) ed[id] = edits[id];
    start(async () => {
      const r = await decideProposalAction(p.id, { mode, opIds, edits: mode === "reject" ? undefined : ed });
      if (!r.ok || !r.proposal) { setError(r.error ?? "تعذّر الحفظ"); return; }
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
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSheet(false); };
    const mq = window.matchMedia("(min-width: 1024px)");
    const onMq = () => { if (mq.matches) setSheet(false); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); mq.removeEventListener("change", onMq); };
  }, [showSheet]);

  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOpenExpanded = openOps.length > 0 && openOps.every((o) => expanded.has(o.op_id));
  function editSomething(mobile: boolean) {
    if (mobile) {
      setExpanded(new Set(openOps.map((o) => o.op_id)));
      setSheet(true);
      return;
    }
    setExpanded(allOpenExpanded ? new Set() : new Set(openOps.map((o) => o.op_id)));
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

  /** The source column: «من رسالتك» / «صحيفة دعوى ص 2» */
  function sourceShort(o: ProposalOp): string {
    if (o.source.kind !== "document") return "من رسالتك";
    const name = (o.source.document_id && lookup[o.source.document_id]) || "الورقة";
    return `${name}${o.source.page ? ` · ص ${o.source.page}` : ""}`;
  }
  function sourceLong(o: ProposalOp): string {
    if (o.source.kind !== "document") return "من رسالتك في المحادثة";
    const name = (o.source.document_id && lookup[o.source.document_id]) || "مستند";
    return `من الورقة: ${name}${o.source.page ? ` — صفحة ${o.source.page}` : ""}`;
  }

  /** quiet outline pill (the mockup's «عدّل»); per-row secondary actions use it too */
  const btn2 = "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border-2 px-[18px] text-[13.5px] font-medium glass-icon transition hover:text-text disabled:opacity-50";
  /** text-only actions on the card's second footer line (save as suggestions, reject all) */
  const quiet = "inline-flex min-h-11 items-center rounded-full px-3 text-[12.5px] text-text-3 transition hover:text-text disabled:opacity-50";

  const card = (inSheet: boolean) => {
    const limit = !inSheet && p.ops.length > MOBILE_ROWS + 1 && openOps.length > 0;
    return (
      <div className={cx("bg-card", inSheet
        ? "flex max-h-[88dvh] flex-col rounded-t-[24px] border-t border-border-2 shadow-pop"
        : "overflow-hidden rounded-[24px] border border-border-2 shadow-card")}>
        {inSheet ? <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-card-3" /> : null}
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--hairline-v2)] px-4 py-4 sm:px-[22px]">
          <span className="mark inline-flex size-9 shrink-0 items-center justify-center rounded-[12px]">
            <FolderClosed aria-hidden size={18} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <p id={inSheet ? `sheet-title-${p.id}` : undefined} className="text-[15px] font-bold leading-[normal] text-title">{titleOf(p)}</p>
            <p className="mt-0.5 text-[11.5px] leading-[normal] text-text-3">
              {openOps.length ? <><span className="font-num">{itemsLabel(p.ops.length)}</span> · مش هيتحفظ حاجة قبل ما تأكد</> : decisionSummary(p)}
            </p>
          </div>
          {inSheet ? (
            <button type="button" onClick={() => setSheet(false)} aria-label="إغلاق" className="-me-2 flex size-11 items-center justify-center rounded-full text-text-3 hover:bg-card-2">
              <X aria-hidden size={20} strokeWidth={1.8} />
            </button>
          ) : null}
        </div>

        <ul className={cx(inSheet && "min-h-0 flex-1 overflow-y-auto overscroll-contain")}>
          {p.ops.map((o, i) => {
            const isOpen = expanded.has(o.op_id);
            const isEditing = editing === o.op_id;
            const merged = { ...o.args, ...(edits[o.op_id] ?? {}) };
            const live = open(o.status);
            const lone = live ? blockedBy(o) : null;
            const hard = live ? blockedBy(o, true) : null;
            const sel = selected.has(o.op_id);
            // only fact rows show their quote (clamped); the rest keep it in the expand
            const factQuote = o.tool === "add_fact" && o.source.kind === "document" ? o.source.quote : null;
            const tagList = [
              edits[o.op_id] || o.edited ? <Tag key="e" tone="neutral">معدّل</Tag> : null,
              !o.quote_verified && live ? <Tag key="q" tone="warn">راجع المصدر</Tag> : null,
              o.status === "suggested" ? <Tag key="s" tone="warn">مقترح</Tag> : null,
              o.status === "failed" ? <Tag key="f" tone="bad">ما اتحفظش</Tag> : null,
            ].filter(Boolean);
            const tags = tagList.length ? tagList : null;
            return (
              <li key={o.op_id} className={cx("not-first:border-t not-first:border-[var(--hairline-v2)]", o.status === "rejected" && "opacity-55", limit && i >= MOBILE_ROWS && "lg:block hidden")}>
                {/* kind · value (+ fact quote) · source · check — the mockup's hairline row */}
                <div className="flex items-start gap-3.5 px-4 py-[13px] sm:px-[22px]">
                  <span className="w-[58px] shrink-0 pt-0.5 text-[11.5px] leading-[normal] text-text-4 sm:w-[72px]">{kindOf(o)}</span>
                  <button type="button" onClick={() => toggle(o.op_id)} aria-expanded={isOpen} title={isOpen ? "اقفل التفاصيل" : "اعرض التفاصيل"} className="min-w-0 flex-1 text-start">
                    <span className={cx("block text-[13.5px] font-semibold leading-[1.5] text-text sm:text-[14.5px]", !isOpen && "line-clamp-2")}>
                      {summaryOf({ ...o, args: merged }) || OP_TITLE[o.tool]}
                    </span>
                    {factQuote && !isOpen ? <span className="text-doc mt-[3px] line-clamp-2 text-[13px] leading-[1.8]! text-text-3">«{factQuote}»</span> : null}
                    <span className="mt-[3px] flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="text-[11px] leading-[normal] text-text-4">{sourceShort(o)}</span>
                      {tags}
                    </span>
                  </button>
                  {live ? (
                    <button type="button" role="checkbox" aria-checked={sel} aria-label={sel ? `شيل ${kindOf(o)} من الحفظ` : `ضيف ${kindOf(o)} للحفظ`}
                      onClick={() => toggleSelect(o)} disabled={pending || (!sel && !!lone && lone.includes("مرفوض"))}
                      className={cx("relative mt-0.5 inline-flex size-[22px] shrink-0 items-center justify-center rounded-full border transition before:absolute before:-inset-3 before:content-[''] disabled:opacity-40",
                        sel ? "border-[var(--accent-edge)] text-gold" : "border-border text-transparent hover:text-text-4")}>
                      <Check aria-hidden size={12} strokeWidth={2.6} />
                    </button>
                  ) : (
                    <span aria-label={o.status === "rejected" ? "مرفوض" : o.status === "suggested" ? "اتحفظ كمقترح" : "اتحفظ"}
                      className={cx("mt-0.5 inline-flex size-[22px] shrink-0 items-center justify-center rounded-full",
                        o.status === "rejected" ? "bg-card-2 text-text-4" : o.status === "suggested" ? "bg-warn-bg text-warn" : "bg-good-bg text-good")}>
                      {o.status === "rejected" ? <X aria-hidden size={12} strokeWidth={2.6} /> : <Check aria-hidden size={12} strokeWidth={2.6} />}
                    </span>
                  )}
                </div>

                {isOpen ? (
                  <div className="space-y-3 px-4 pb-4 sm:pe-[22px] sm:ps-[108px]">
                    {isEditing ? (
                      <EditFields op={o} values={merged} onChange={(k, v) => setEdits((e) => ({ ...e, [o.op_id]: { ...(e[o.op_id] ?? {}), [k]: v } }))} display={display} />
                    ) : (
                      <dl className="grid grid-cols-[minmax(4.5rem,7.5rem)_1fr] gap-x-4 gap-y-1.5 text-[13.5px]">
                        {OP_FIELDS[o.tool].map((f) => {
                          const v = display(f, merged[f.key]);
                          return v === null ? null : (
                            <div key={f.key} className="contents">
                              <dt className="text-text-3">{f.label}</dt>
                              <dd className="min-w-0 break-words text-text">{f.type === "date" || f.type === "number" ? <span className="num">{v}</span> : v}</dd>
                            </div>
                          );
                        })}
                      </dl>
                    )}

                    <div className="rounded-[14px] border border-border-2 bg-card-2 px-3.5 py-2.5">
                      <p className="text-[11.5px] text-text-3">{sourceLong(o)}</p>
                      {o.source.quote ? <p className="text-doc mt-1 text-[15px] text-text">«{o.source.quote}»</p> : <p className="mt-1 text-xs text-text-4">بدون اقتباس</p>}
                      {!o.quote_verified ? <p className="mt-1.5 text-xs font-medium text-gold">ما لقيتش النص ده في المصدر، راجعه</p> : null}
                    </div>

                    {o.status === "failed" && o.error ? <p className="rounded-xl bg-bad-bg px-3 py-2 text-[13px] text-bad">{o.error}</p> : null}
                    {o.result_id && o.tool === "create_case" ? <Link href={`/cases/${o.result_id}`} className="inline-flex min-h-11 items-center text-[13.5px] font-semibold text-text hover:underline">فتح ملف القضية ←</Link> : null}

                    {live ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" disabled={pending || !!lone} title={lone ?? undefined} onClick={() => decide("confirm", [o.op_id])}
                          className="bg-primary-fill inline-flex h-11 items-center gap-1.5 rounded-full px-[18px] text-[13.5px] font-bold transition disabled:opacity-50">
                          <Check aria-hidden size={15} strokeWidth={2.6} />احفظ ده
                        </button>
                        <button type="button" disabled={pending} onClick={() => setEditing(isEditing ? null : o.op_id)} className={btn2}>
                          {isEditing ? "خلّصت التعديل" : "تعديل"}
                        </button>
                        <button type="button" disabled={pending} onClick={() => decide("reject", [o.op_id])}
                          className={cx(quiet, "gap-1 text-[13px] hover:text-bad")}>
                          <X aria-hidden size={15} strokeWidth={2.4} />ارفض
                        </button>
                        {lone ? <p className="basis-full text-xs text-text-4">{lone}</p> : null}
                      </div>
                    ) : null}
                    {live && sel && hard ? <p className="text-xs text-text-4">{hard}</p> : null}
                  </div>
                ) : null}
              </li>
            );
          })}
          {limit ? (
            <li className="border-t border-[var(--hairline-v2)] lg:hidden">
              <button type="button" onClick={() => setSheet(true)} aria-haspopup="dialog"
                className="flex min-h-11 w-full items-center justify-center gap-1 px-4 py-3 text-[13px] font-semibold text-text-2 hover:text-text">
                كل العناصر · <span className="font-num">{itemsLabel(p.ops.length)}</span>
              </button>
            </li>
          ) : null}
        </ul>

        {error ? <p className="mx-4 mt-3 shrink-0 rounded-xl bg-bad-bg px-3 py-2 text-[13.5px] text-bad sm:mx-[22px]">{error}</p> : null}

        <div className={cx("shrink-0 border-t border-[var(--hairline-v2)] px-4 pt-3.5 sm:px-[22px]", openOps.length && (inSheet || allOpenExpanded) ? "pb-2" : "pb-4", inSheet && "pb-[calc(0.5rem+env(safe-area-inset-bottom))]")}>
          {openOps.length ? (
            <>
              <div className="flex gap-2">
                <button type="button" disabled={pending || !chosen.length} onClick={() => decide("confirm", chosen.map((o) => o.op_id))}
                  className="bg-primary-fill h-11 min-w-0 flex-1 truncate rounded-full px-5 text-[14.5px] font-bold transition disabled:opacity-50">
                  {pending ? "بحفظ…" : <>{newCase ? "احفظ الملف" : "احفظ"} · <span className="font-num">{itemsLabel(chosen.length)}</span></>}
                </button>
                {/* mobile: opens the sheet with every open row expanded; desktop (and inside the sheet): expands / collapses the rows */}
                <button type="button" disabled={pending}
                  onClick={() => editSomething(!inSheet && !window.matchMedia("(min-width: 1024px)").matches)} className={btn2}>
                  {inSheet ? (allOpenExpanded ? "اقفل" : "عدّل") : (
                    <><span className="lg:hidden">عدّل</span><span className="hidden lg:inline">{allOpenExpanded ? "اقفل" : "عدّل"}</span></>
                  )}
                </button>
              </div>
              {/* the other decisions: under the pair once «عدّل» has opened the rows (and always in the sheet); at rest
                  the footer is only the mockup's pair */}
              {inSheet || allOpenExpanded ? <div className="mt-1 flex flex-wrap items-center justify-center gap-x-1">
                <button type="button" disabled={pending || !chosen.length} onClick={() => decide("suggest", chosen.map((o) => o.op_id))} className={quiet}>احفظ كمقترحات</button>
                <span aria-hidden className="text-text-4">·</span>
                <button type="button" disabled={pending} onClick={() => decide("reject", openOps.map((o) => o.op_id))} className={cx(quiet, "hover:text-bad")}>ارفض الكل</button>
                {caseLink ? <><span aria-hidden className="text-text-4">·</span><Link href={`/cases/${caseLink}`} className={cx(quiet, "font-semibold text-text-2")}>فتح ملف القضية ←</Link></> : null}
              </div> : null}
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13.5px] text-text-2">{decisionSummary(p)}</p>
              {caseLink ? <Link href={`/cases/${caseLink}`} className="inline-flex min-h-11 items-center text-[13.5px] font-semibold text-text hover:underline">فتح ملف القضية ←</Link> : null}
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
      <div className="flex min-h-[52px] items-center gap-2.5 rounded-[18px] border border-border-2 bg-card py-1 pe-2 ps-4 text-[13.5px] shadow-soft">
        <span aria-hidden className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-good-bg text-good"><Check size={12} strokeWidth={2.6} /></span>
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
        <button type="button" onClick={() => setShowDecided(false)} className="mb-1.5 inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-text-3 hover:text-text">
          <ChevronDown aria-hidden size={14} strokeWidth={2} className="rotate-180" />اطوِ البطاقة
        </button>
      ) : null}
      {card(false)}
      {showSheet ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden" role="dialog" aria-modal="true" aria-labelledby={`sheet-title-${p.id}`}>
          <button type="button" aria-label="إغلاق" tabIndex={-1} onClick={() => setSheet(false)} className="fade-enter absolute inset-0 bg-backdrop" />
          <div className="sheet-enter relative">{card(true)}</div>
        </div>
      ) : null}
    </>
  );
}

function Tag({ tone, children }: { tone: "neutral" | "warn" | "bad"; children: React.ReactNode }) {
  // v2 status: a small dot + a word (gold = needs the lawyer, red = failed, muted = info)
  const [dot, txt] = { neutral: ["bg-text-4", "text-text-3"], warn: ["bg-gold", "text-gold"], bad: ["bg-bad", "text-bad"] }[tone];
  return <span className={cx("inline-flex items-center gap-1 text-[11px] font-semibold leading-[18px]", txt)}><span aria-hidden className={cx("size-1.5 rounded-full", dot)} />{children}</span>;
}

function decisionSummary(p: Proposal) {
  const n = (s: ProposalOp["status"]) => p.ops.filter((o) => o.status === s).length;
  const parts = [n("confirmed") && `اتحفظ ${n("confirmed")}`, n("suggested") && `مقترح ${n("suggested")}`, n("rejected") && `مرفوض ${n("rejected")}`, n("failed") && `ما اتحفظش ${n("failed")}`].filter(Boolean);
  return parts.join(" · ") || "—";
}

function EditFields({ op, values, onChange, display }: {
  op: ProposalOp; values: Record<string, unknown>; onChange: (k: string, v: unknown) => void; display: (f: FieldSpec, v: unknown) => string | null;
}) {
  const input = "min-h-11 w-full rounded-[14px] border border-border bg-field px-3 py-2 text-[15px] text-text focus:border-text-4 focus:outline-none";
  return (
    <div className="space-y-2.5">
      {OP_FIELDS[op.tool].map((f) => {
        const v = values[f.key];
        const id = `${op.op_id}-${f.key}`;
        let control;
        if (f.type === "ref") control = <p className="py-1 text-sm text-text-2">{display(f, v) ?? "—"}</p>;
        else if (f.type === "bool") control = <input id={id} type="checkbox" checked={!!v} onChange={(e) => onChange(f.key, e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />;
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
            <label htmlFor={id} className={cx("text-xs text-text-3", f.type !== "bool" && "mb-1 block")}>{f.label}</label>
            {control}
          </div>
        );
      })}
    </div>
  );
}
