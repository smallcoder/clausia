"use client";
/**
 * Drop a paper anywhere on the page or the chat (split layout, PR 4). One provider at the root of the shell listens for files
 * dragged over the window and shows the overlay «ارمي الورقة هنا»; the dropped files wait in the context until the chat panel
 * takes them (ChatThread decides: upload to the open case, ask which case, or say why not). A drag that carries no file (text, a
 * link) is ignored. Nothing is uploaded here.
 */
import { FileUp } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface Dropped { id: number; files: File[] }
interface DropCtx { dropped: Dropped | null; clear: () => void }

const Ctx = createContext<DropCtx>({ dropped: null, clear: () => {} });
export const useDrop = () => useContext(Ctx);

const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");

export function DropProvider({ children }: { children: ReactNode }) {
  const [over, setOver] = useState(false);
  const [dropped, setDropped] = useState<Dropped | null>(null);

  useEffect(() => {
    let depth = 0; // dragenter / dragleave fire for every child: count them, or the overlay flickers
    let n = 0;
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; setOver(true); };
    const move = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; };
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (depth === 0) setOver(false); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); // otherwise the browser opens the file in this tab
      depth = 0;
      setOver(false);
      setDropped({ id: ++n, files: Array.from(e.dataTransfer?.files ?? []) });
    };
    const end = () => { depth = 0; setOver(false); };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", move);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    window.addEventListener("dragend", end);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", move);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
      window.removeEventListener("dragend", end);
    };
  }, []);

  const clear = useCallback(() => setDropped(null), []);
  const value = useMemo(() => ({ dropped, clear }), [dropped, clear]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {over ? (
        <div aria-hidden className="fade-enter pointer-events-none fixed inset-0 z-70 flex items-center justify-center bg-backdrop p-5">
          <div className="flex size-full items-center justify-center rounded-xl border-2 border-dashed border-gold bg-gold-bg">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border-2 bg-card px-10 py-8 text-center shadow-pop">
              <span className="mark inline-flex size-14 items-center justify-center rounded-lg"><FileUp size={26} strokeWidth={1.8} /></span>
              <p className="text-lg font-bold text-title">ارمي الورقة هنا</p>
              <p className="text-base text-text-3">PDF أو صورة (JPEG / PNG / WebP)</p>
            </div>
          </div>
        </div>
      ) : null}
    </Ctx.Provider>
  );
}
