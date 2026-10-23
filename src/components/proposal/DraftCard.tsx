"use client";
/**
 * The confirmation card of a draft from a template (docs/design/ia/IALibrary* chat): «صحيفة استئناف · كريم المثالي», then what the CODE filled from the
 * case file, each value with where it came from, then in gold what still needs the lawyer (the missing values, and the legal grounds / requests, which are
 * never written unless he asked and then wait for his confirmation). «أكّد» saves the draft (the same tap as every card); nothing is saved before it.
 * It is drawn by ProposalCard when EVERY op of the card is a `create_draft`; the tap and the undo toast stay there, this file only draws it.
 * A saved card keeps the same rows and offers «افتح المسودة» (in the case's «المذكرات والأحكام») and «نزّلها Word».
 */
import { Check, ChevronDown, FileText, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cx } from "@/components/ui";
import { needsFromLawyer } from "@/lib/library/fill";
import type { Proposal, ProposalOp } from "@/lib/proposals";

/** a card whose ops are all drafts */
export const isDraftCard = (p: Proposal) => p.ops.length > 0 && p.ops.every((o) => o.tool === "create_draft");

const open = (s: ProposalOp["status"]) => s === "pending" || s === "failed";
/** filled rows shown before «كل البيانات» */
const SHOWN = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function draftHref(caseId: string, draftId: string) {
  return `/cases/${caseId}?tab=memos&draft=${draftId}`;
}

export function DraftCard({ proposal: p, pending, error, onDecide, downloadHref }: {
  proposal: Proposal;
  pending: boolean;
  error: string | null;
  onDecide: (mode: "confirm" | "reject", opIds: string[]) => void;
  /** the Word file of a saved draft (the office-style export); absent = the button says «قريباً» */
  downloadHref?: (draftId: string) => string;
}) {
  const [all, setAll] = useState(false);
  const live = p.ops.filter((o) => open(o.status));

  return (
    <div className="space-y-3">
      {p.ops.map((o) => {
        const d = o.draft;
        const saved = o.status === "confirmed" || o.status === "suggested";
        const rejected = o.status === "rejected";
        const caseId = typeof o.args.case === "string" && UUID.test(o.args.case) ? o.args.case : p.case_id;
        if (rejected) {
          return (
            <div key={o.op_id} className="flex min-h-13 items-center gap-2.5 rounded-lg border border-border-2 bg-card py-1 ps-4 pe-2 text-base shadow-soft">
              <span aria-hidden className="inline-flex size-tick shrink-0 items-center justify-center rounded-full bg-card-2 text-text-4"><X size={12} strokeWidth={2.6} /></span>
              <span className="min-w-0 flex-1 truncate py-2 font-semibold text-text">اترفضت المسودة{d ? `: ${d.title}` : ""}</span>
            </div>
          );
        }
        if (!d) return null; // an old card with no preview: nothing to draw
        const rows = all ? d.fill.filled : d.fill.filled.slice(0, SHOWN);
        const rest = d.fill.filled.length - SHOWN;
        const need = needsFromLawyer(d.fill);
        const toConfirm = d.fill.lawyer.filter((l) => l.state === "needs_confirmation");
        return (
          <div key={o.op_id} className="overflow-hidden rounded-xl border border-border-2 bg-card shadow-card">
            <div className="flex items-center gap-3 border-b border-border-2 px-4 py-4 sm:px-5.5">
              <span className="mark inline-flex size-9 shrink-0 items-center justify-center rounded-md"><FileText aria-hidden size={18} strokeWidth={2} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-md font-bold leading-[normal] text-title">{d.title}</p>
                <p className="mt-0.5 text-xs leading-[normal] text-text-3">{saved ? "مسودة · اتحفظت" : "مسودة · مش هتتحفظ قبل ما تأكد"}</p>
              </div>
            </div>

            <ul className="px-4 py-3 sm:px-5.5" aria-label="اللي اتملا من ملف القضية">
              {rows.map((f) => (
                <li key={f.key} className="flex min-h-9 flex-wrap items-baseline gap-x-2.5 gap-y-0.5 py-1.5">
                  <span aria-hidden className="inline-flex size-tick shrink-0 translate-y-0.5 items-center justify-center rounded-full bg-good-bg text-good"><Check size={11} strokeWidth={2.8} /></span>
                  <span className="min-w-0 flex-1 basis-56 text-base leading-6 text-text">
                    <span className="text-text-3">{f.label}: </span><bdi className="font-semibold">{f.value.length > 90 ? `${f.value.slice(0, 90)}…` : f.value}</bdi>
                  </span>
                  <span className="shrink-0 rounded-full border border-border-2 px-2.5 py-0.5 text-xs text-text-3">{f.source}</span>
                </li>
              ))}
              {rest > 0 ? (
                <li>
                  <button type="button" onClick={() => setAll(!all)} aria-expanded={all} className="tap inline-flex items-center gap-1 text-sm font-semibold text-text-2 hover:text-text">
                    {all ? "اعرض أقل" : `كل البيانات (${d.fill.filled.length})`}<ChevronDown aria-hidden size={14} strokeWidth={2} className={cx("transition", all && "rotate-180")} />
                  </button>
                </li>
              ) : null}
              {!d.fill.filled.length ? <li className="py-1.5 text-base text-text-3">مفيش بيانات في ملف القضية تتملا تلقائي.</li> : null}
            </ul>

            <div className="space-y-1.5 border-t border-border-2 px-4 py-3 text-base leading-6 sm:px-5.5">
              {need.length ? (
                <p className="font-semibold text-gold"><span aria-hidden>• </span><span className="font-num">{need.length}</span> {need.length === 1 ? "خانة محتاجة" : need.length === 2 ? "خانتين محتاجين" : need.length <= 10 ? "خانات محتاجة" : "خانة محتاجة"} منك: {need.join("، ")}</p>
              ) : null}
              {toConfirm.length ? (
                <p className="font-semibold text-gold"><span aria-hidden>• </span>{toConfirm.map((l) => l.heading).join("، ")}: مكتوبة بناءً على طلبك، ومحتاجة تأكيدك</p>
              ) : null}
              {!need.length && !toConfirm.length ? <p className="text-text-3">كل الخانات اتملت من الملف. راجعها قبل ما تعتمدها.</p> : null}
              <p className="text-sm text-text-3">الأسباب والطلبات القانونية مش بتتملا من Clausia إلا لو طلبت منها تكتبها.</p>
            </div>

            {o.status === "failed" && o.error ? <p className="mx-4 mb-3 rounded-md bg-bad-bg px-3 py-2 text-sm text-bad sm:mx-5.5">{o.error}</p> : null}
            {!saved && error ? <p className="mx-4 mb-3 rounded-md bg-bad-bg px-3 py-2 text-base text-bad sm:mx-5.5" role="alert">{error}</p> : null}
            <div className="flex gap-2 px-4 pb-4 sm:px-5.5">
              {saved && o.result_id && caseId ? (
                <>
                  <Link href={draftHref(caseId, o.result_id)} className="bg-primary-fill inline-flex h-11 min-w-0 flex-1 items-center justify-center truncate rounded-full px-5 text-base font-bold transition">افتح المسودة</Link>
                  {downloadHref ? (
                    <a href={downloadHref(o.result_id)} className="inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-border-2 px-4.5 text-base font-medium glass-icon transition hover:text-text">نزّلها Word</a>
                  ) : (
                    <span aria-disabled className="inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-border-2 px-4.5 text-base font-medium text-text-4">نزّلها Word · قريباً</span>
                  )}
                </>
              ) : (
                <>
                  <button type="button" disabled={pending || !live.length} onClick={() => onDecide("confirm", [o.op_id])}
                    className="bg-primary-fill h-11 min-w-0 flex-1 truncate rounded-full px-5 text-base font-bold transition disabled:opacity-50">{pending ? "بحفظ…" : "أكّد"}</button>
                  <button type="button" disabled={pending} onClick={() => onDecide("reject", [o.op_id])}
                    className="inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-border-2 px-4.5 text-base font-medium glass-icon transition hover:text-text disabled:opacity-50">ارفض</button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
