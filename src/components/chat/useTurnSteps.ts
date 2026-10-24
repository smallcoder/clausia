"use client";
/**
 * Live steps while Clausia works: «بقرا الصحيفة ص 2…». Polls GET /api/chat/steps for the turn this browser started (the steps are
 * written by the server only when a read tool or a card really runs). A read takes a fraction of a second, so the steps are
 * queued and each one stays on screen a moment (DWELL) before the next. When the queue is empty it returns null and the chat
 * says «Clausia بيفكّر…»: no step is ever shown that did not run, and none is made up to fill the wait.
 */
import { useEffect, useState } from "react";
import type { TurnSteps } from "@/app/api/chat/steps/route";

const POLL_MS = 600;
const DWELL_MS = 1300;
const TICK_MS = 200;

export function useTurnSteps(turnId: string | null): string | null {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    if (!turnId) { setCurrent(null); return; }
    let stop = false;
    let after = 0;
    let shownAt = 0;
    let showing: string | null = null;
    const queue: string[] = [];
    let poll: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = (await fetch(`/api/chat/steps?turn=${encodeURIComponent(turnId)}&after=${after}`, { cache: "no-store" }).then((x) => (x.ok ? x.json() : null))) as TurnSteps | null;
        for (const s of r?.steps ?? []) { queue.push(s.label); after = Math.max(after, s.seq); }
      } catch { /* keep what is on screen */ }
      if (!stop) poll = setTimeout(tick, POLL_MS);
    };
    poll = setTimeout(tick, POLL_MS / 2);
    const show = setInterval(() => {
      const held = Date.now() - shownAt >= DWELL_MS;
      if (queue.length && (showing === null || held)) {
        showing = queue.shift()!;
        shownAt = Date.now();
        setCurrent(showing);
      } else if (!queue.length && showing !== null && held) {
        showing = null;
        setCurrent(null);
      }
    }, TICK_MS);
    return () => { stop = true; clearTimeout(poll); clearInterval(show); setCurrent(null); };
  }, [turnId]);
  return current;
}
