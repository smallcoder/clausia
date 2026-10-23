"use client";
/**
 * Chat sessions of ONE context: the list (with «+ محادثة جديدة» on top) and the desktop button + menu in the panel header.
 * Each session has an auto title (its first message, about 40 characters) and a date; a hearing's session reads «جلسة 22/10».
 */
import { ChevronDown, List, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DateText, cx } from "@/components/ui";
import { shortDay, withSession, type Session } from "./panel-types";

export function SessionList({ sessions, currentId, hrefFor, onPick }: {
  sessions: Session[];
  currentId: string | null;
  /** the link of a session; "new" = a new empty session */
  hrefFor: (id: string | "new") => string;
  onPick?: () => void;
}) {
  return (
    <ul className="flex flex-col">
      <li>
        <Link href={hrefFor("new")} onClick={onPick} className="flex min-h-11 items-center gap-2 rounded-md px-3 text-base font-semibold text-gold transition hover:bg-card-2">
          <Plus aria-hidden size={16} strokeWidth={2} />محادثة جديدة
        </Link>
      </li>
      {sessions.map((s) => (
        <li key={s.id}>
          <Link href={hrefFor(s.id)} onClick={onPick} aria-current={s.id === currentId ? "true" : undefined}
            className={cx("flex min-h-11 items-center justify-between gap-3 rounded-md px-3 py-2 transition hover:bg-card-2", s.id === currentId && "bg-card-2")}>
            <span className="min-w-0 truncate text-base font-semibold text-text">{s.hearingDate ? <DateText value={`جلسة ${shortDay(s.hearingDate)}`} /> : s.title}</span>
            <DateText iso={s.day} className="shrink-0 text-sm text-text-4" />
          </Link>
        </li>
      ))}
      {sessions.length === 0 ? <li className="px-3 py-2 text-sm text-text-4">مفيش محادثات قبل كده.</li> : null}
    </ul>
  );
}

/**
 * The chat panel's desktop header: the context title (a button, with a chevron) and a small line under it. The title and the
 * list button on the end side open the same menu: this context's sessions only.
 */
export function SessionsMenu({ sessions, currentId, title, sub }: { sessions: Session[]; currentId: string | null; title: string; sub: string | null }) {
  const path = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const sp = new URLSearchParams(params.toString());
  return (
    <div ref={box} className="relative hidden items-center gap-2.5 border-b border-border-2 px-4.5 py-4 xl:flex">
      <div className="min-w-0 flex-1 leading-[normal]">
        <button type="button" onClick={() => setOpen(!open)} aria-haspopup="true" aria-expanded={open} title="محادثات"
          className="tap flex max-w-full items-center gap-1.5 text-md font-bold text-title">
          <span className="truncate">{title}</span>
          <ChevronDown aria-hidden size={14} strokeWidth={2.2} className="shrink-0 text-glass-icon" />
        </button>
        {sub ? (
          <div className="mt-0.5 flex items-center gap-1.5 text-sm text-text-2">
            <span aria-hidden className="size-dot shrink-0 rounded-full bg-gold" /><span className="truncate"><DateText value={sub} /></span>
          </div>
        ) : null}
      </div>
      <button type="button" onClick={() => setOpen(!open)} aria-label="محادثات" aria-expanded={open} title="محادثات"
        className="tap inline-flex size-8.5 shrink-0 items-center justify-center rounded-full border border-border-2 text-glass-icon transition hover:text-text">
        <List aria-hidden size={16} strokeWidth={1.9} />
      </button>
      {open ? (
        <div className="absolute start-3 top-full z-20 mt-1 max-h-96 w-80 overflow-y-auto rounded-lg glass p-1.5">
          <SessionList sessions={sessions} currentId={currentId} hrefFor={(id) => withSession(path, sp, id)} onPick={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
