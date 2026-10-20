"use client";
// Inline change of a document's type (the lawyer's own edit; saved at once).
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setDocumentTypeAction } from "@/lib/documents/actions";
import { DOC_TYPE } from "@/lib/labels";

export function DocTypeSelect({ documentId, value }: { documentId: string; value: string }) {
  const [current, setCurrent] = useState(value);
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  const router = useRouter();
  return (
    <label className="inline-flex items-center gap-1.5 text-caption text-ink-3">
      <span className="sr-only">نوع المستند</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          const prev = current;
          setCurrent(next); setError(false);
          start(async () => {
            const r = await setDocumentTypeAction(documentId, next);
            if (!r.ok) { setCurrent(prev); setError(true); } else router.refresh();
          });
        }}
        className="h-11 rounded-md border border-line bg-surface px-3 text-callout font-medium text-ink-2 hover:border-line-strong focus:border-accent focus:outline-none disabled:opacity-60"
      >
        {Object.entries(DOC_TYPE).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      </select>
      {error ? <span className="text-danger">تعذر الحفظ</span> : null}
    </label>
  );
}
