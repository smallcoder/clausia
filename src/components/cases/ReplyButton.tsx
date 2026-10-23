"use client";
/**
 * «اكتب الرد» on a defense of the opponent: attaches that defense to the composer as a context chip («اسأل Clausia»),
 * puts «اكتب الرد على الدفع ده» in the box when it is empty, and sends nothing. The lawyer reads it and taps send.
 * It sits above the row's stretched button (relative z-10), so a tap here does not open the row's sheet.
 */
import { useAttach } from "@/components/cases/AskTarget";
import { REPLY_PREFILL } from "@/components/cases/sides";
import type { AskItem } from "@/lib/assistant/ask";

export function WriteReply({ item }: { item: AskItem }) {
  const attach = useAttach();
  return (
    <button type="button" onClick={() => attach(item, REPLY_PREFILL)}
      className="bg-primary-fill tap relative z-10 inline-flex h-8 items-center rounded-full px-3.5 text-sm font-semibold">
      اكتب الرد
    </button>
  );
}
