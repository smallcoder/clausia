// Small pieces of the edit highlights on the case page (split layout, PR 2): the «مقترح» tag, the struck old value, and an
// «old ← new» pair. A highlighted field or row uses the `.gold-wash` class (globals.css) and these.
import type { ReactNode } from "react";
import { editsLabel } from "@/lib/edits";

export { editsLabel };

/** The small «مقترح» tag on a highlighted field. */
export const SuggestedTag = ({ children = "مقترح" }: { children?: ReactNode }) => (
  <span className="inline-flex h-4.5 items-center rounded-sm bg-gold-edge px-1.75 text-xs font-bold text-gold">{children}</span>
);

/** The old value, struck through, in the faint text colour. */
export const Was = ({ children }: { children: ReactNode }) => <span className="font-normal text-text-4 line-through">{children}</span>;

/** «22/10/2026 ← 5/12/2026»: the old value struck (when there is one), an arrow, the new value in gold. */
export function Change({ old, next, className = "" }: { old: string | null; next: string; className?: string }) {
  return (
    <span className={className}>
      {old ? <><Was>{old}</Was> <span aria-hidden className="text-text-3">←</span> </> : null}
      <b className="font-bold text-gold">{next}</b>
    </span>
  );
}

/** «مقترح من المحادثة · مستني تأكيدك»: the line under a new row that is waiting for the lawyer. */
export const WaitingLine = () => <span className="mt-0.5 block text-xs text-gold">مقترح من المحادثة · مستني تأكيدك</span>;
