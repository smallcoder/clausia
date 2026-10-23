"use client";
import { Printer } from "lucide-react";

/** «اطبع»: opens the browser's print dialog for the receipt page (the toolbar around it is hidden in print). */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="bg-primary-fill tap inline-flex h-control-xl items-center justify-center gap-2 rounded-full px-5 text-base font-bold transition hover:opacity-90">
      <Printer aria-hidden size={16} strokeWidth={2} />اطبع
    </button>
  );
}
