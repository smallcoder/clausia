"use client";
/**
 * A paper was dropped in the general context: which case is it for? The lawyer's cases (recent first), or «قضية جديدة» (the paper
 * goes to this general chat and Clausia reads it for a new case). Nothing is uploaded until a choice is tapped.
 */
import { useEffect, useState } from "react";
import { pickerCasesAction } from "@/lib/assistant/actions";

type CaseRow = { id: string; label: string; client: string | null };

export function DropPicker({ fileName, onPick, onCancel }: { fileName: string; onPick: (caseId: string | null) => void; onCancel: () => void }) {
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  useEffect(() => {
    let live = true;
    pickerCasesAction().then((r) => { if (live) setCases(r); }, () => { if (live) setCases([]); });
    return () => { live = false; };
  }, []);

  return (
    <div className="px-2.5 xl:px-4.5">
      <section aria-label="اختار القضية" className="mx-auto w-full max-w-messages rounded-xl border border-border-2 bg-card shadow-soft">
        <div className="flex items-start justify-between gap-3 border-b border-border-2 px-4 py-3">
          <p className="min-w-0 text-base font-bold leading-6 text-title">الورقة دي لأنهي قضية؟ <span className="block truncate text-sm font-normal text-text-3" dir="auto">{fileName}</span></p>
          <button type="button" onClick={onCancel} className="tap inline-flex h-8 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-text-3 transition hover:text-text">إلغاء</button>
        </div>
        <ul className="max-h-52 overflow-y-auto overscroll-contain py-1">
          <li>
            <button type="button" onClick={() => onPick(null)} className="tap flex min-h-11 w-full items-center gap-2 px-4 text-start text-base font-bold text-gold transition hover:bg-gold-bg">
              <span aria-hidden>+</span>قضية جديدة
            </button>
          </li>
          {cases === null ? <li role="status" className="px-4 py-3 text-sm text-text-3">بجيب القضايا…</li> : null}
          {(cases ?? []).map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c.id)} className="tap flex min-h-11 w-full items-baseline gap-2 border-t border-border-2 px-4 py-2 text-start transition hover:bg-bg">
                <span className="min-w-0 truncate text-base font-semibold text-text">{c.label}</span>
                {c.client ? <span className="shrink-0 text-sm text-text-3">{c.client}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
