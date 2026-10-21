"use client";
/**
 * The Chat screen's docked composer area (docs/design/*Chat*.dc.html): fixed to the viewport bottom, a 780px column
 * (380px on mobile), padding 40/40/24 on desktop and 40/12/18 on mobile, over the mockup's fade (page colour at 92%
 * from 45% up, then transparent). A spacer of the same measured height stays in the page flow, so the last message
 * never sits under the composer. (The shell's FixedDock has other paddings; this is the Chat-only variant.)
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

export function ChatDock({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setH(Math.ceil(e.borderBoxSize?.[0]?.blockSize ?? e.target.getBoundingClientRect().height)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  return (
    <>
      <div aria-hidden style={{ height: h }} className="shrink-0" />
      <div ref={box}
        className="fixed inset-x-0 bottom-0 z-30 flex justify-center bg-[linear-gradient(to_top,color-mix(in_srgb,var(--bg)_92%,transparent)_45%,transparent)] px-3 pb-[calc(18px+env(safe-area-inset-bottom))] pt-10 sm:px-10 sm:pb-6" /* ds-allow: safe-area inset needs calc() */>
        <div className="w-full max-w-95 sm:max-w-composer">{children}</div>
      </div>
    </>
  );
}
