"use client";
/**
 * «النسخ» (PR 7): the history of the draft. Every save and every accepted change is a version; an old version can be opened (read only, in the paper) and
 * made current again — which is itself a NEW version, so nothing is ever deleted. The list is read from `draft_versions`; the body of one version is read
 * only when it is opened.
 */
import { History, RotateCcw } from "lucide-react";
import type { VersionRow } from "@/lib/draft/store";
import { cx } from "@/components/ui";
import { stamp } from "./time";

export const KIND_LABEL: Record<VersionRow["kind"], string> = {
  original: "الأصل (قبل أول تعديل)", save: "حفظ", accept: "قبول تعديل من Clausia", restore: "استرجاع نسخة", import: "فتح من ملف Word",
};

export function VersionsPanel({ versions, openId, busy, error, onOpen, onRestore, onUndoAccept }: {
  versions: VersionRow[];
  /** the version being looked at now */
  openId: string | null;
  busy: boolean;
  error: string | null;
  onOpen: (v: VersionRow) => void;
  onRestore: (v: VersionRow) => void;
  /** the newest version is an accepted change: one tap puts back the version before it */
  onUndoAccept: (() => void) | null;
}) {
  return (
    <section aria-label="النسخ" className="rounded-xl border border-border-2 bg-card px-4 py-3 shadow-card sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-md font-bold text-title"><History aria-hidden size={16} strokeWidth={2} className="text-text-3" />النسخ</h2>
        <p className="text-sm text-text-3">كل حفظ وكل تعديل بتقبله نسخة. الاسترجاع بيعمل نسخة جديدة، ومفيش حاجة بتتمسح.</p>
        {onUndoAccept ? (
          <button type="button" onClick={onUndoAccept} disabled={busy} className="tap ms-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-border-2 px-3.5 text-sm font-semibold text-text-2 transition hover:text-text disabled:opacity-50">
            <RotateCcw aria-hidden size={14} strokeWidth={2} />تراجع عن آخر تعديل اتقبل
          </button>
        ) : null}
      </div>
      {error ? <p role="alert" className="mt-2 rounded-md bg-bad-bg px-3 py-2 text-base text-bad">{error}</p> : null}
      {versions.length ? (
        <ul className="mt-2 divide-y divide-border-2">
          {versions.map((v, i) => (
            <li key={v.id} className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 py-2", openId === v.id && "bg-gold-bg/40")}>
              <button type="button" onClick={() => onOpen(v)} className="tap min-w-0 flex-1 basis-56 text-start">
                <span className="text-base font-semibold text-text">{KIND_LABEL[v.kind]}</span>
                {i === 0 ? <span className="ms-2 rounded-full bg-gold-bg px-2 py-0.5 text-xs font-semibold text-gold-text-small">الحالية</span> : null}
                {v.note ? <span className="block truncate text-sm text-text-3">{v.note}</span> : null}
              </button>
              <bdi dir="ltr" className="font-num text-sm text-text-3">{stamp(v.created_at)}</bdi>
              {i > 0 ? (
                <button type="button" onClick={() => onRestore(v)} disabled={busy} className="tap inline-flex h-9 items-center rounded-full border border-border-2 px-3.5 text-sm font-semibold text-text-2 transition hover:text-text disabled:opacity-50">استرجعها</button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-base text-text-3">لسه مفيش نسخ: أول حفظ هيعمل أول نسخة.</p>}
    </section>
  );
}
