"use client";
/**
 * The confirmation card of changes Clausia proposed to a saved draft (docs/design/ia/IADraft*, the chat side): «2 تعديلات مقترحة في المسودة», one row per
 * change («1 · ترتيب» and the reason), «اقبل الاتنين» and «راجعهم في المسودة». The changes themselves are drawn in the draft as tracked changes (old words
 * struck through, new words in gold, ✓ / ×); nothing in the draft changes until a ✓ here or there. Drawn by ProposalCard when EVERY op of the card is an
 * `edit_draft`; the tap stays there (it calls the same decide as every card).
 */
import { Check, FileText, X } from "lucide-react";
import Link from "next/link";
import { draftHref } from "@/components/proposal/DraftCard";
import type { Proposal, ProposalOp } from "@/lib/proposals";

export const isDraftEditCard = (p: Proposal) => p.ops.length > 0 && p.ops.every((o) => o.tool === "edit_draft");

const open = (s: ProposalOp["status"]) => s === "pending" || s === "failed";

/** «تعديل مقترح» / «تعديلين مقترحين» / «3 تعديلات مقترحة» */
export function countTitle(n: number): string {
  return n === 1 ? "تعديل مقترح في المسودة" : n === 2 ? "تعديلين مقترحين في المسودة" : `${n} ${n <= 10 ? "تعديلات مقترحة" : "تعديل مقترح"} في المسودة`;
}
const acceptAll = (n: number) => (n === 1 ? "اقبل التعديل" : n === 2 ? "اقبل الاتنين" : "اقبل الكل");

export function DraftEditCard({ proposal: p, pending, error, onDecide }: {
  proposal: Proposal;
  pending: boolean;
  error: string | null;
  onDecide: (mode: "confirm" | "reject", opIds: string[]) => void;
}) {
  const live = p.ops.filter((o) => open(o.status));
  const first = p.ops[0];
  const draftId = typeof first?.args.draft === "string" ? first.args.draft : null;
  const caseId = first?.edit?.case ?? p.case_id;
  const href = caseId && draftId ? draftHref(caseId, draftId) : null;
  return (
    <div className="overflow-hidden rounded-xl border border-border-2 bg-card shadow-card">
      <div className="flex items-center gap-3 border-b border-border-2 px-4 py-4 sm:px-5.5">
        <span className="mark inline-flex size-9 shrink-0 items-center justify-center rounded-md"><FileText aria-hidden size={18} strokeWidth={2} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-md font-bold leading-[normal] text-title">{live.length ? countTitle(live.length) : "تعديلات المسودة"}</p>
          {first?.edit?.draft_title ? <p className="mt-0.5 truncate text-xs leading-[normal] text-text-3">{first.edit.draft_title}</p> : null}
        </div>
      </div>
      <ul className="divide-y divide-border-2" aria-label="التعديلات">
        {p.ops.map((o, i) => (
          <li key={o.op_id} className="px-4 py-3 sm:px-5.5">
            <p className="flex items-center gap-2 text-xs text-text-3">
              <span><span className="font-num">{i + 1}</span> · {String(o.args.label ?? "تعديل")}</span>
              {o.status === "confirmed" || o.status === "suggested" ? <span className="inline-flex items-center gap-1 font-semibold text-good"><Check aria-hidden size={12} strokeWidth={2.6} />اتقبل</span> : null}
              {o.status === "rejected" ? <span className="inline-flex items-center gap-1 font-semibold text-text-3"><X aria-hidden size={12} strokeWidth={2.6} />اترفض</span> : null}
            </p>
            <p className="mt-0.5 text-base leading-6 text-text">{String(o.args.why ?? "")}</p>
            {o.edit?.src ? <p className="mt-1 text-sm text-gold-text-small">من {o.edit.src}</p> : null}
            {o.status === "failed" && o.error ? <p className="mt-1 rounded-md bg-bad-bg px-3 py-2 text-sm text-bad">{o.error}</p> : null}
          </li>
        ))}
      </ul>
      {error ? <p className="mx-4 mb-3 rounded-md bg-bad-bg px-3 py-2 text-base text-bad sm:mx-5.5" role="alert">{error}</p> : null}
      <div className="flex gap-2 border-t border-border-2 px-4 py-4 sm:px-5.5">
        {live.length ? (
          <>
            <button type="button" disabled={pending} onClick={() => onDecide("confirm", live.map((o) => o.op_id))}
              className="bg-primary-fill h-11 min-w-0 flex-1 truncate rounded-full px-5 text-base font-bold transition disabled:opacity-50">{pending ? "بحفظ…" : acceptAll(live.length)}</button>
            {href ? <Link href={href} className="inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-border-2 px-4.5 text-base font-medium glass-icon transition hover:text-text">راجعهم في المسودة</Link> : null}
          </>
        ) : href ? (
          <Link href={href} className="bg-primary-fill inline-flex h-11 min-w-0 flex-1 items-center justify-center truncate rounded-full px-5 text-base font-bold transition">افتح المسودة</Link>
        ) : null}
      </div>
    </div>
  );
}
