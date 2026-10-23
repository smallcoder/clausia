"use client";
/**
 * The phone's context picker (the pill in the chat header opens it): step 1 — «محادثة عامة» or a case; step 2 — the
 * sessions of that context, with «+ محادثة جديدة» on top. It also holds the account menu (the phone has no top bar).
 * Cases and sessions are read through server actions (the lawyer's own client: RLS).
 */
import { ChevronRight, FolderClosed, LogOut, MessageCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { pickerCasesAction, pickerSessionsAction } from "@/lib/assistant/actions";
import { useAccount } from "./draft";
import { SessionList } from "./Sessions";
import type { Session } from "./panel-types";

type Pick = { kind: "general" } | { kind: "case"; id: string; label: string };
type CaseRow = { id: string; label: string; client: string | null };

export function ContextPicker({ currentCaseId, currentSessionId, onClose }: { currentCaseId: string | null; currentSessionId: string | null; onClose: () => void }) {
  const account = useAccount();
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);

  useEffect(() => { void pickerCasesAction().then(setCases).catch(() => setCases([])); }, []);
  useEffect(() => {
    if (!pick) return;
    let live = true;
    setSessions(null);
    void pickerSessionsAction(pick.kind === "case" ? pick.id : null).then((r) => { if (live) setSessions(r); }).catch(() => { if (live) setSessions([]); });
    return () => { live = false; };
  }, [pick]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const hrefFor = (id: string | "new") => {
    const base = pick?.kind === "case" ? `/cases/${pick.id}` : "/";
    return `${base}?s=${id}`;
  };
  const row = "flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-start text-base font-semibold text-text transition hover:bg-card-2";

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end xl:hidden">
      <button type="button" aria-label="اقفل" tabIndex={-1} onClick={onClose} className="fade-enter absolute inset-0 bg-backdrop" />
      <div role="dialog" aria-modal="true" aria-label="اختار المحادثة" className="sheet-enter relative flex max-h-[85dvh] flex-col rounded-t-xl glass" /* ds-allow: dvh: at most 85% of the visible screen */>
        <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-card-3" />
        <div className="flex items-center gap-2 px-3 pb-1 pt-2">
          {pick ? (
            <button type="button" onClick={() => setPick(null)} aria-label="رجوع" className="tap inline-flex size-9 items-center justify-center rounded-full border border-border-2 text-text-3"><ChevronRight aria-hidden size={18} strokeWidth={2} /></button>
          ) : null}
          <h2 className="min-w-0 flex-1 truncate px-1 text-lg font-bold text-title">{pick ? (pick.kind === "case" ? pick.label : "محادثة عامة") : "اختار المحادثة"}</h2>
          <button type="button" onClick={onClose} aria-label="اقفل" className="tap inline-flex size-9 items-center justify-center rounded-full border border-border-2 text-text-3"><X aria-hidden size={16} strokeWidth={2} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[calc(14px+env(safe-area-inset-bottom))]" /* ds-allow: safe-area inset needs calc() */>
          {pick ? (
            sessions ? <SessionList sessions={sessions} currentId={(pick.kind === "case" ? pick.id : null) === currentCaseId ? currentSessionId : null} hrefFor={hrefFor} onPick={onClose} /> : <p className="px-3 py-4 text-sm text-text-4">بحمّل…</p>
          ) : (
            <>
              <button type="button" onClick={() => setPick({ kind: "general" })} className={row}>
                <MessageCircle aria-hidden size={18} strokeWidth={1.9} className="text-text-3" /><span className="flex-1">محادثة عامة</span>
                {currentCaseId === null ? <span aria-hidden className="size-1.5 rounded-full bg-gold" /> : null}
              </button>
              <p className="px-3 pb-1 pt-3 text-sm font-medium text-text-4">القضايا</p>
              {cases === null ? <p className="px-3 py-2 text-sm text-text-4">بحمّل…</p> : cases.length === 0 ? <p className="px-3 py-2 text-sm text-text-4">مفيش قضايا لسه.</p> : cases.map((c) => (
                <button key={c.id} type="button" onClick={() => setPick({ kind: "case", id: c.id, label: c.client ?? c.label })} className={row}>
                  <FolderClosed aria-hidden size={18} strokeWidth={1.9} className="shrink-0 text-text-3" />
                  <span className="min-w-0 flex-1 truncate">{c.client ? `${c.client} · ${c.label}` : c.label}</span>
                  {c.id === currentCaseId ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-gold" /> : null}
                </button>
              ))}
              <div className="mt-3 border-t border-border-2 px-3 pt-3">
                <p className="truncate text-sm font-semibold text-text">{account.officeName}</p>
                <p className="truncate text-sm text-text-4" dir="ltr">{account.email}</p>
                <div className="mt-2 flex items-center justify-between text-base text-text-2">المظهر <ThemeToggle /></div>
                <form action="/auth/signout" method="post">
                  <button className="flex min-h-11 w-full items-center gap-2 rounded-md text-base text-text-2 hover:bg-card-2"><LogOut aria-hidden size={16} strokeWidth={1.9} /> تسجيل الخروج</button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
