"use client";
/**
 * Saved-decision confirmations that survive the server refresh after saving (the decided hearing leaves the
 * «بلا قرار» list, so the inline form unmounts). Wrap a list with <DecisionNotices>; RecordDecision reports here.
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { formatDmy } from "@/lib/dates";

export interface Notice { id: number; label: string; nextDate: string | null }
const Ctx = createContext<((n: Omit<Notice, "id">) => void) | null>(null);
export const useDecisionNotice = () => useContext(Ctx);

export function DecisionNotices({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Notice[]>([]);
  const push = useCallback((n: Omit<Notice, "id">) => setItems((xs) => [...xs, { ...n, id: Date.now() + Math.random() }]), []);
  return (
    <Ctx.Provider value={push}>
      {items.length ? (
        <ul className="mb-3 space-y-2 print:hidden">
          {items.map((n) => (
            <li key={n.id} role="status" className="flex items-start justify-between gap-3 rounded-lg border border-ok/20 bg-ok-soft px-3 py-2 text-sm text-ok">
              <span>
                <span className="block">تم حفظ قرار {n.label}</span>
                {n.nextDate ? <span className="block">الجلسة القادمة: <span className="num font-semibold">{formatDmy(n.nextDate)}</span></span> : null}
              </span>
              <button type="button" onClick={() => setItems((xs) => xs.filter((x) => x.id !== n.id))} className="shrink-0 text-xs underline" aria-label="إخفاء">إخفاء</button>
            </li>
          ))}
        </ul>
      ) : null}
      {children}
    </Ctx.Provider>
  );
}
