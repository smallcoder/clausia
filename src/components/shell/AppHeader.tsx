"use client";
import { CalendarDays, FolderClosed, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/hearings", label: "الجلسات", Icon: CalendarDays },
  { href: "/cases", label: "القضايا", Icon: FolderClosed },
];

export function ClausiaMark({ size = 30 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size, fontSize: size * 0.57 }}
      className="font-num inline-flex shrink-0 items-center justify-center mark rounded-lg font-black shadow-[0_4px_10px_rgba(18,26,43,0.3)]">
      C
    </span>
  );
}

/** Top bar from the mockups: logo, الجلسات / القضايا pills, theme, account. No sidebar, no tab bar. */
export function AppHeader({ initials, officeName, email }: { initials: string; officeName: string; email: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <header className="mx-auto flex h-14 w-full max-w-[1240px] items-center gap-1.5 px-3.5 sm:h-[72px] sm:gap-2.5 sm:px-10">
      <Link href="/" className="flex flex-1 items-center gap-2 sm:gap-2.5" aria-label="Clausia — الرئيسية">
        <ClausiaMark />
        <span className="font-num text-[17px] font-extrabold tracking-[-0.02em] text-text sm:text-lg">Clausia</span>
      </Link>
      {NAV.map(({ href, label, Icon }) => {
        const on = path === href || path.startsWith(href + "/");
        return (
          <Link key={href} href={href} aria-label={label} aria-current={on ? "page" : undefined}
            className={`inline-flex size-10 items-center justify-center gap-2 rounded-xl border text-sm shadow-soft transition sm:h-[38px] sm:w-auto sm:px-3.5 ${on ? "border-gold/40 bg-card-3 font-bold text-text" : "border-border bg-chip text-text-3 hover:text-text"}`}>
            <Icon size={17} strokeWidth={1.9} aria-hidden />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}
      <ThemeToggle className="sm:size-[38px]" />
      <div ref={menu} className="relative">
        <button type="button" onClick={() => setOpen(!open)} aria-label="الحساب" aria-expanded={open}
          className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-chip text-xs font-bold text-text sm:size-[38px] sm:text-[13px]">
          {initials}
        </button>
        {open ? (
          <div className="absolute end-0 top-12 z-40 w-60 rounded-2xl border border-border bg-card p-2 shadow-pop">
            <div className="px-3 py-2">
              <div className="truncate text-sm font-bold text-text">{officeName}</div>
              <div className="truncate text-xs text-text-4" dir="ltr">{email}</div>
            </div>
            <form action="/auth/signout" method="post">
              <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-text-2 hover:bg-card-2">
                <LogOut size={16} strokeWidth={1.9} aria-hidden /> تسجيل الخروج
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </header>
  );
}
