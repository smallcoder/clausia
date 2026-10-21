"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Mode = "system" | "light" | "dark";
const NEXT: Record<Mode, Mode> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Mode, string> = { system: "المظهر: حسب الجهاز", light: "المظهر: فاتح", dark: "المظهر: داكن" };

/** Cycles system → light → dark. Saved per browser (a convenience, not app data). */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => {
    try {
      const t = localStorage.getItem("clausia-theme");
      if (t === "light" || t === "dark") setMode(t);
    } catch {}
  }, []);
  function next() {
    const m = NEXT[mode];
    setMode(m);
    try {
      if (m === "system") { localStorage.removeItem("clausia-theme"); delete document.documentElement.dataset.theme; }
      else { localStorage.setItem("clausia-theme", m); document.documentElement.dataset.theme = m; }
    } catch {}
  }
  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  return (
    <button type="button" onClick={next} aria-label={LABEL[mode]} title={LABEL[mode]}
      className={`inline-flex size-10 items-center justify-center rounded-md border border-border bg-chip text-text-3 shadow-soft transition hover:text-text ${className}`}>
      <Icon size={18} strokeWidth={1.9} />
    </button>
  );
}
