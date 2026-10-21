"use client";
/**
 * The roll's day strip on touch screens: a clear sideways swipe (≥ 50px, more sideways than up/down) changes the week,
 * through the same URLs as the desktop prev/next buttons. RTL: the strip runs Saturday (right) → Thursday (left), so the
 * past lies to the right and the future to the left. The content moves with the finger: dragging toward the LEFT pulls
 * in what is on the right — the PREVIOUS week; dragging toward the RIGHT brings the NEXT week. While dragging, the strip
 * follows the finger a little and springs back; there is no other hint (owner decision 15). Touch only — a mouse drag
 * on desktop does nothing.
 */
import { useRouter } from "next/navigation";
import { useRef, type ReactNode } from "react";

const MIN = 50;

export function SwipeWeek({ prevHref, nextHref, children }: { prevHref: string; nextHref: string; children: ReactNode }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  const move = (dx: number) => {
    const el = box.current;
    if (!el) return;
    el.style.transition = dx ? "none" : "transform 200ms ease-out";
    el.style.transform = dx ? `translateX(${Math.max(-24, Math.min(24, dx * 0.3))}px)` : "";
  };

  return (
    <div
      ref={box}
      style={{ touchAction: "pan-y" }}
      onTouchStart={(e) => {
        if (e.touches.length !== 1) { start.current = null; return; }
        start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        swiped.current = false;
      }}
      onTouchMove={(e) => {
        const s = start.current;
        if (!s) return;
        const dx = e.touches[0].clientX - s.x;
        const dy = e.touches[0].clientY - s.y;
        move(Math.abs(dx) > Math.abs(dy) ? dx : 0);
      }}
      onTouchEnd={(e) => {
        const s = start.current;
        start.current = null;
        move(0);
        if (!s) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - s.x;
        const dy = t.clientY - s.y;
        if (Math.abs(dx) < MIN || Math.abs(dx) <= Math.abs(dy)) return;
        swiped.current = true;
        router.push(dx > 0 ? nextHref : prevHref);
      }}
      onTouchCancel={() => { start.current = null; move(0); }}
      // a swipe that ends on a day must not also open that day
      onClickCapture={(e) => { if (swiped.current) { e.preventDefault(); e.stopPropagation(); swiped.current = false; } }}
    >
      {children}
    </div>
  );
}
