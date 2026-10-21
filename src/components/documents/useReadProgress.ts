"use client";
/**
 * While a paper is being read: «بقرا الورقة… صفحة 3 من 8», then «بطلّع البيانات من الورقة…». Polls the server once a
 * second only while `active` (the upload action is running). A long read is not a failure: each model call has its
 * own time limit, the whole read has none.
 */
import { useEffect, useState } from "react";
import type { ReadProgress } from "@/app/api/documents/progress/route";

export function useReadProgress(active: boolean): string {
  const [label, setLabel] = useState("بقرا الورقة…");
  useEffect(() => {
    if (!active) { setLabel("بقرا الورقة…"); return; }
    const since = new Date(Date.now() - 10_000).toISOString(); // a little slack for clock skew
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const p = (await fetch(`/api/documents/progress?since=${encodeURIComponent(since)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))) as ReadProgress;
        if (!stop && p) setLabel(p.phase === "extracting" ? "بطلّع البيانات من الورقة…" : p.total ? `بقرا الورقة… صفحة ${p.page} من ${p.total}` : "بقرا الورقة…");
      } catch { /* keep the last label */ }
      if (!stop) timer = setTimeout(tick, 1000);
    };
    timer = setTimeout(tick, 600);
    return () => { stop = true; clearTimeout(timer); };
  }, [active]);
  return label;
}
