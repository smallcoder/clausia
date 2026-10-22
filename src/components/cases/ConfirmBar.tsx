"use client";
/**
 * «في N تعديل مقترح · أكّد · عدّل في المحادثة»: the bar of the case page while the chat has edits waiting (split layout, PR 2).
 * Desktop: a small sticky bar at the bottom of the page column. Phone (the page is a sheet): one bottom bar with
 * «أكّد · تعديلين» next to «رجوع للشات» — it is put into the slot of the shell's own bottom bar, so there is one bar, not two.
 * «أكّد» is the card's own confirm: `decideProposalAction` (all or nothing per card), for the ops this page shows. No other write.
 */
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { decideProposalAction } from "@/lib/assistant/actions";
import { editsLabel } from "@/lib/edits";

export const CONFIRM_SLOT = "sheet-confirm-slot";

export function ConfirmBar({ groups, count }: { groups: { proposalId: string; opIds: string[] }[]; count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setSlot(document.getElementById(CONFIRM_SLOT)); }, []);

  function confirm() {
    setError(null);
    start(async () => {
      for (const g of groups) {
        const r = await decideProposalAction(g.proposalId, { mode: "confirm", opIds: g.opIds });
        if (!r.ok) { setError(r.error ?? "تعذّر الحفظ"); break; } // a card that fails is saved nowhere (all or nothing); the next ones wait
      }
      router.refresh();
    });
  }
  /** «عدّل في المحادثة»: the chat is beside the page; put the cursor in its box */
  const editInChat = () => document.querySelector<HTMLTextAreaElement>("aside textarea")?.focus();

  if (!groups.length) return null;
  const primary = "bg-primary-fill tap inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-5 text-base font-bold transition disabled:opacity-50";
  return (
    <>
      {/* desktop */}
      <div className="sticky bottom-5 z-20 mt-auto hidden pt-4 xl:block">
        <div role="region" aria-label="تعديلات مقترحة" className="flex items-center gap-3 rounded-xl border border-gold-edge bg-card py-2.5 pe-3 ps-5 shadow-pop">
          <span aria-hidden className="size-dot shrink-0 rounded-full bg-gold" />
          <p className="min-w-0 flex-1 text-base text-text">
            {error ?? <>في <span className="font-num font-bold text-gold">{count}</span> تعديل مقترح</>}
          </p>
          <button type="button" onClick={editInChat} className="tap inline-flex h-11 shrink-0 items-center rounded-full px-3 text-base font-semibold text-text-3 hover:text-text">عدّل في المحادثة</button>
          <button type="button" onClick={confirm} disabled={pending} className={primary}>
            <Check aria-hidden size={15} strokeWidth={2.6} />{pending ? "بحفظ…" : "أكّد"}
          </button>
        </div>
      </div>
      {/* phone: into the shell's bottom bar */}
      {slot ? createPortal(
        <div className="xl:hidden">
          {error ? <p className="mb-2 rounded-md bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p> : null}
          <button type="button" onClick={confirm} disabled={pending} className={`${primary} h-control-xl w-full`}>
            {pending ? "بحفظ…" : <>أكّد · <span className="font-num">{editsLabel(count)}</span></>}
          </button>
        </div>, slot) : null}
    </>
  );
}
