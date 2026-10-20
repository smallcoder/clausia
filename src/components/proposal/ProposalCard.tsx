"use client";
/**
 * Confirmation card. Shows exactly what will be saved, op by op, with its source and quote.
 * Nothing is saved without a tap. Other features render it by passing the proposal object (+ a lookup of
 * uuid → display name, built on the server with `buildProposalLookup`).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Check, ChevronDown, FileCheck2, X } from "lucide-react";
import { Badge, Button, cx } from "@/components/ui";
import { decideProposalAction } from "@/lib/assistant/actions";
import { CASE_STATUS, DECISION, DOC_TYPE, PARTY_ROLE, STAGE } from "@/lib/labels";
import type { Proposal, ProposalOp } from "@/lib/proposals";
import { OP_FIELDS, OP_TITLE, type FieldSpec } from "@/lib/tools/registry";

type Edits = Record<string, Record<string, unknown>>;
type Mode = "confirm" | "suggest" | "reject";

const STATUS: Record<ProposalOp["status"], { label: string; tone: "neutral" | "ok" | "suggest" | "danger" }> = {
  pending: { label: "بانتظار تأكيدك", tone: "neutral" },
  confirmed: { label: "حُفظ", tone: "ok" },
  suggested: { label: "حُفظ كمقترح", tone: "suggest" },
  rejected: { label: "مرفوض", tone: "neutral" },
  failed: { label: "تعذّر الحفظ", tone: "danger" },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const open = (s: ProposalOp["status"]) => s === "pending" || s === "failed";

function opName(o: ProposalOp): string {
  const a = o.args as Record<string, string | number | undefined>;
  if (a.name) return String(a.name);
  if (a.case_number) return `الدعوى رقم ${a.case_number}${a.case_year ? ` لسنة ${a.case_year}` : ""}`;
  if (a.title) return String(a.title);
  if (o.tool === "add_hearing" && a.date) return `جلسة ${a.date}`;
  return OP_TITLE[o.tool];
}

function summaryOf(o: ProposalOp): string {
  const a = o.args as Record<string, string | number | boolean | undefined>;
  const cut = (s: unknown, n = 70) => { const t = String(s ?? ""); return t.length > n ? `${t.slice(0, n)}…` : t; };
  switch (o.tool) {
    case "create_client": return [a.name, a.phone].filter(Boolean).join(" · ");
    case "create_case": case "update_case": return [a.case_number && `رقم ${a.case_number}${a.case_year ? ` لسنة ${a.case_year}` : ""}`, a.court, a.circuit, a.title, a.status && CASE_STATUS[a.status as keyof typeof CASE_STATUS], a.stage && a.stage !== "first_instance" && STAGE[a.stage as keyof typeof STAGE]].filter(Boolean).join(" · ");
    case "add_party": return [a.name, a.role && PARTY_ROLE[a.role as keyof typeof PARTY_ROLE]].filter(Boolean).join(" · ");
    case "add_fact": return [a.date_text ?? a.date ?? "بدون تاريخ", cut(a.text)].join(" · ");
    case "add_request": case "add_argument": return cut(a.text, 90);
    case "add_hearing": return [a.date, a.purpose].filter(Boolean).join(" · ");
    case "record_decision": return [a.decision && DECISION[a.decision as keyof typeof DECISION], a.next_date && `الجلسة القادمة ${a.next_date}`].filter(Boolean).join(" · ");
    case "add_judgment": return [a.date, cut(a.operative_text)].filter(Boolean).join(" · ");
    case "attach_document": return a.doc_type ? DOC_TYPE[a.doc_type as keyof typeof DOC_TYPE] : "";
  }
}

export function ProposalCard({ proposal: initial, lookup = {} }: { proposal: Proposal; lookup?: Record<string, string> }) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [edits, setEdits] = useState<Edits>({});
  // small open cards start expanded; big cards (documents: 10–25 ops) and decided cards start as compact rows
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initial.ops.length <= 3 ? initial.ops.filter((o) => open(o.status)).map((o) => o.op_id) : []));
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [sheet, setSheet] = useState(false);

  // resync with a fresh prop after router.refresh() (card decided in another tab or by another feature);
  // keyed on the statuses so a local decision that the server already reflects is not thrown away
  const sig = `${initial.id}:${initial.status}:${initial.ops.map((o) => o.status).join(",")}`;
  const [seenSig, setSeenSig] = useState(sig);
  if (sig !== seenSig) {
    setSeenSig(sig);
    setP(initial);
  }

  const openOps = p.ops.filter((o) => open(o.status));
  const createdCase = p.ops.find((o) => o.tool === "create_case" && o.result_id && (o.status === "confirmed" || o.status === "suggested"));
  const caseLink = createdCase?.result_id ?? (p.status !== "pending" ? p.case_id : null);
  const warnings = p.ops.filter((o) => !o.quote_verified && open(o.status)).length;

  function decide(mode: Mode, opIds?: string[]) {
    setError(null);
    const ids = opIds ?? openOps.map((o) => o.op_id);
    const ed: Edits = {};
    for (const id of ids) if (edits[id]) ed[id] = edits[id];
    start(async () => {
      const r = await decideProposalAction(p.id, { mode, opIds: ids, edits: mode === "reject" ? undefined : ed });
      if (!r.ok || !r.proposal) { setError(r.error ?? "تعذّر الحفظ"); return; }
      setP(r.proposal);
      setEditing(null);
      router.refresh();
    });
  }

  /** Why a lone ✓ on this op cannot work yet: an «@ref» it points at (in this card) is not saved. */
  function blockedBy(o: ProposalOp): string | null {
    for (const f of OP_FIELDS[o.tool]) {
      const v = o.args[f.key];
      if (f.type !== "ref" || typeof v !== "string" || !v.startsWith("@")) continue;
      const target = p.ops.find((x) => x.args.ref === v.slice(1));
      if (!target || target.result_id) continue;
      return target.status === "rejected" ? `العنصر المرتبط (${opName(target)}) مرفوض` : `أكّد العنصر المرتبط أولًا: ${opName(target)}`;
    }
    return null;
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

  function display(o: ProposalOp, f: FieldSpec, v: unknown): string | null {
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

  function sourceLine(o: ProposalOp) {
    if (o.source.kind === "document") {
      const name = (o.source.document_id && lookup[o.source.document_id]) || "مستند";
      return `من المستند: ${name}${o.source.page ? ` — صفحة ${o.source.page}` : ""}`;
    }
    return "من رسالتك في المحادثة";
  }

  const card = (inSheet: boolean) => (
    <div className={cx("bg-surface", inSheet ? "flex max-h-[85dvh] flex-col rounded-t-[var(--radius-lg)] shadow-3" : "overflow-hidden rounded-[var(--radius)] shadow-2")}>
      {inSheet ? <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line-strong" /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 pt-3.5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-accent-soft text-accent"><FileCheck2 aria-hidden size={19} strokeWidth={1.5} /></span>
          <div>
            <p id={inSheet ? `sheet-title-${p.id}` : undefined} className="text-callout font-semibold text-ink">بطاقة تأكيد <span className="num font-normal text-ink-3">· {p.ops.length}</span></p>
            <p className="text-caption text-ink-3">{openOps.length ? "لن يُحفظ شيء قبل تأكيدك. راجع كل عنصر." : "تم البتّ في هذه البطاقة."}</p>
          </div>
        </div>
        {warnings ? <Badge tone="brass">{warnings === 1 ? "عنصر يحتاج مراجعة المصدر" : `${warnings} عناصر تحتاج مراجعة المصدر`}</Badge> : null}
        {inSheet ? (
          <button type="button" onClick={() => setSheet(false)} aria-label="إغلاق" className="-me-2 flex size-11 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2">
            <X aria-hidden size={20} strokeWidth={1.5} />
          </button>
        ) : null}
      </div>

      <ul className={cx("grouped border-t border-hairline", inSheet && "min-h-0 flex-1 overflow-y-auto overscroll-contain")}>
        {p.ops.map((o) => {
          const isOpen = expanded.has(o.op_id);
          const isEditing = editing === o.op_id;
          const st = STATUS[o.status];
          const merged = { ...o.args, ...(edits[o.op_id] ?? {}) };
          const blocked = open(o.status) ? blockedBy(o) : null;
          return (
            <li key={o.op_id} className={cx(o.status === "rejected" && "opacity-60")}>
              <button type="button" onClick={() => toggle(o.op_id)} aria-expanded={isOpen}
                className="flex min-h-11 w-full items-start gap-3 px-4 py-3 text-right transition-colors hover:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-callout font-semibold text-ink">{OP_TITLE[o.tool]}</span>
                    {edits[o.op_id] || o.edited ? <Badge tone="accent">معدّل</Badge> : null}
                    {!o.quote_verified && open(o.status) ? <Badge tone="brass">راجع المصدر</Badge> : null}
                  </span>
                  <span className="mt-0.5 block truncate text-callout text-ink-2">{summaryOf({ ...o, args: merged }) || "—"}</span>
                </span>
                <Badge tone={st.tone} className="shrink-0">{st.label}</Badge>
                <ChevronDown aria-hidden size={18} strokeWidth={1.5} className={cx("mt-1 shrink-0 text-ink-3 transition-transform duration-200", isOpen && "rotate-180")} />
              </button>

              {isOpen ? (
                <div className="space-y-3 px-4 pb-4">
                  {isEditing ? (
                    <EditFields op={o} values={merged} onChange={(k, v) => setEdits((e) => ({ ...e, [o.op_id]: { ...(e[o.op_id] ?? {}), [k]: v } }))} display={(f, v) => display(o, f, v)} />
                  ) : (
                    <dl className="grid grid-cols-[minmax(5rem,8.5rem)_1fr] gap-x-4 gap-y-2 text-callout lg:grid-cols-[minmax(6rem,12rem)_1fr]">
                      {OP_FIELDS[o.tool].map((f) => {
                        const v = display(o, f, merged[f.key]);
                        return v === null ? null : (
                          <div key={f.key} className="contents">
                            <dt className="text-ink-3">{f.label}</dt>
                            <dd className="min-w-0 break-words text-ink">{f.type === "date" || f.type === "number" ? <span className="num">{v}</span> : v}</dd>
                          </div>
                        );
                      })}
                    </dl>
                  )}

                  <div className="rounded-[var(--radius-sm)] bg-surface-2 px-3.5 py-2.5">
                    <p className="text-xs text-ink-3">{sourceLine(o)}</p>
                    {o.source.quote ? <p className="text-doc mt-1 text-[16px] text-ink">«{o.source.quote}»</p> : <p className="mt-1 text-xs text-ink-3">بدون اقتباس</p>}
                    {!o.quote_verified ? <p className="mt-1.5 text-xs font-medium text-brass">لم أجد هذا النص في المصدر — راجعه</p> : null}
                  </div>

                  {o.status === "failed" && o.error ? <p className="rounded-[var(--radius-sm)] bg-danger-soft px-3 py-2 text-caption text-danger">{o.error}</p> : null}
                  {o.result_id && o.tool === "create_case" ? <Link href={`/cases/${o.result_id}`} className="inline-block text-sm text-accent hover:underline">فتح ملف الدعوى</Link> : null}

                  {open(o.status) ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" disabled={pending || !!blocked} title={blocked ?? undefined} onClick={() => decide("confirm", [o.op_id])}><Check aria-hidden size={16} strokeWidth={2} />تأكيد</Button>
                      <Button size="sm" variant="secondary" disabled={pending} onClick={() => setEditing(isEditing ? null : o.op_id)}>{isEditing ? "إنهاء التعديل" : "تعديل"}</Button>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide("reject", [o.op_id])}><X aria-hidden size={16} strokeWidth={2} />رفض</Button>
                      {blocked ? <p className="basis-full text-xs text-ink-3">{blocked}</p> : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {error ? <p className="mx-4 mb-3 shrink-0 rounded-[var(--radius-sm)] bg-danger-soft px-3 py-2 text-callout text-danger">{error}</p> : null}

      <div className={cx("flex shrink-0 flex-wrap items-center gap-2 border-t border-hairline px-4 py-3", inSheet ? "bg-surface pb-[calc(0.75rem+env(safe-area-inset-bottom))]" : "bg-surface-2/60")}>
        {openOps.length ? (
          <>
            <Button size="sm" disabled={pending} onClick={() => decide("confirm")}>{pending ? "جارٍ الحفظ…" : openOps.length === p.ops.length ? "تأكيد الكل" : `تأكيد الباقي (${openOps.length})`}</Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => decide("suggest")}>حفظ كمقترحات</Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide("reject")} className="text-ink-2">رفض الكل</Button>
          </>
        ) : (
          <p className="text-callout text-ink-2">{decisionSummary(p)}</p>
        )}
        {caseLink ? <Link href={`/cases/${caseLink}`} className="ms-auto text-sm font-medium text-accent hover:underline">ملف الدعوى ←</Link> : null}
      </div>
    </div>
  );

  // Mobile (<1024px): a pending card is a compact summary that opens a bottom sheet. Desktop: inline.
  const pendingCard = openOps.length > 0;
  return (
    <>
      {pendingCard ? (
        <div className="flex items-center gap-3 rounded-[var(--radius)] bg-surface px-4 py-3 shadow-2 lg:hidden">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-accent-soft text-accent"><FileCheck2 aria-hidden size={19} strokeWidth={1.5} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-callout font-semibold text-ink">بطاقة تأكيد <span className="num font-normal text-ink-3">· {openOps.length}</span> عناصر</span>
            <span className="block truncate text-caption text-ink-3">{warnings ? `${warnings} تحتاج مراجعة المصدر` : "لن يُحفظ شيء قبل تأكيدك"}</span>
          </span>
          <Button size="sm" onClick={() => setSheet(true)} aria-haspopup="dialog">مراجعة</Button>
        </div>
      ) : null}
      {showSheet ? null : <div className={cx(pendingCard && "hidden lg:block")}>{card(false)}</div>}
      {showSheet ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden" role="dialog" aria-modal="true" aria-labelledby={`sheet-title-${p.id}`}>
          <button type="button" aria-label="إغلاق" tabIndex={-1} onClick={() => setSheet(false)} className="fade-enter absolute inset-0 bg-backdrop" />
          <div className="sheet-enter relative">{card(true)}</div>
        </div>
      ) : null}
    </>
  );
}

function decisionSummary(p: Proposal) {
  const n = (s: ProposalOp["status"]) => p.ops.filter((o) => o.status === s).length;
  const parts = [n("confirmed") && `حُفظ ${n("confirmed")}`, n("suggested") && `مقترح ${n("suggested")}`, n("rejected") && `مرفوض ${n("rejected")}`].filter(Boolean);
  return parts.join(" · ") || "—";
}

function EditFields({ op, values, onChange, display }: {
  op: ProposalOp; values: Record<string, unknown>; onChange: (k: string, v: unknown) => void; display: (f: FieldSpec, v: unknown) => string | null;
}) {
  const input = "min-h-11 w-full rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-2 text-body text-ink focus:border-accent focus:bg-surface focus:outline-none";
  return (
    <div className="space-y-2.5">
      {OP_FIELDS[op.tool].map((f) => {
        const v = values[f.key];
        const id = `${op.op_id}-${f.key}`;
        let control;
        if (f.type === "ref") control = <p className="py-1 text-sm text-ink-2">{display(f, v) ?? "—"}</p>;
        else if (f.type === "bool") control = <input id={id} type="checkbox" checked={!!v} onChange={(e) => onChange(f.key, e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />;
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
            <label htmlFor={id} className={cx("text-xs text-ink-3", f.type !== "bool" && "mb-1 block")}>{f.label}</label>
            {control}
          </div>
        );
      })}
    </div>
  );
}
