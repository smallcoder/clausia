"use client";
/**
 * Chat sessions of ONE context: the list (with «+ محادثة جديدة» on top) and the desktop button + menu in the panel header.
 * Each session has an auto title (its first message, about 40 characters) and a date; a hearing's session reads «جلسة 22/10».
 */
import { List, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { formatDmy } from "@/lib/dates";
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
            <span className="min-w-0 truncate text-base font-semibold text-text">{s.hearingDate ? `جلسة ${shortDay(s.hearingDate)}` : s.title}</span>
            <span className="num font-num shrink-0 text-sm text-text-4">{formatDmy(s.day)}</span>
          </Link>
        </li>
      ))}
      {sessions.length === 0 ? <li className="px-3 py-2 text-sm text-text-4">مفيش محادثات قبل كده.</li> : null}
    </ul>
  );
}

/** The sessions button of the chat header (desktop): opens a list of this context's sessions only. */
export function SessionsMenu({ sessions, currentId }: { sessions: Session[]; currentId: string | null }) {
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
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-label="محادثات" aria-expanded={open} title="محادثات"
        className="tap inline-flex size-8.5 items-center justify-center rounded-full border border-border-2 text-glass-icon transition hover:text-text">
        <List aria-hidden size={16} strokeWidth={1.9} />
      </button>
      {open ? (
        <div className="absolute end-0 top-11 z-20 max-h-96 w-80 overflow-y-auto rounded-lg border border-border-2 bg-card p-1.5 shadow-pop">
          <SessionList sessions={sessions} currentId={currentId} hrefFor={(id) => withSession(path, sp, id)} onPick={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
