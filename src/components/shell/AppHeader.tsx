"use client";
/**
 * v2 top bar (docs/design): brand + office name · centered glass tab capsule (Home / Hearings / Cases) ·
 * glass circles for alerts and account. Mobile: logo, capsule (active tab labeled, others icon-only), account.
 */
import { Bell, CalendarDays, FolderClosed, House, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "./ThemeToggle";

const TABS = [
  { href: "/", label: "الرئيسية", Icon: House },
  { href: "/hearings", label: "الجلسات", Icon: CalendarDays },
  { href: "/cases", label: "القضايا", Icon: FolderClosed },
];

export function ClausiaMark({ size = 30 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size, fontSize: size * 0.53, borderRadius: size * 0.3 }}
      className="mark font-num inline-flex shrink-0 items-center justify-center font-extrabold">
      C
    </span>
  );
}

function activeTab(path: string) {
  if (path.startsWith("/hearings")) return "/hearings";
  if (path.startsWith("/cases")) return "/cases";
  return "/"; // Home and the chat threads opened from it
}

export function AppHeader({ initials, officeName, email, alerts }: { initials: string; officeName: string; email: string; alerts: number }) {
  const path = usePathname();
  const on = activeTab(path);
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <header className={`sticky top-0 z-40 mx-auto ${path.startsWith("/chat/") || /^\/cases\/[^/]+/.test(path) ? "hidden sm:grid" : "grid"} h-[72px] w-full max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center gap-2 px-3.5 sm:h-[88px] sm:px-10`}>
      <Link href="/" className="flex items-center gap-2.5 justify-self-start" aria-label="Clausia — الرئيسية">
        <span className="sm:hidden"><ClausiaMark size={40} /></span>
        <span className="hidden sm:inline-flex"><ClausiaMark size={36} /></span>
        <span className="hidden min-w-0 leading-tight sm:block">
          <span className="font-num block text-lg font-bold tracking-[-0.02em] text-title">Clausia</span>
          {officeName ? <span className="block max-w-48 truncate text-xs text-text-4">{officeName}</span> : null}
        </span>
      </Link>

      <nav aria-label="الأقسام" className="glass flex items-center gap-0.5 rounded-lg p-1 sm:rounded-xl">
        {TABS.map(({ href, label, Icon }) => {
          const active = on === href;
          return (
            <Link key={href} href={href} aria-label={label} aria-current={active ? "page" : undefined}
              className={`tap inline-flex h-9 items-center gap-2 rounded-lg text-sm transition sm:h-10 sm:px-4.5 sm:text-base ${active ? "bg-selected px-3 font-semibold text-on-selected shadow-[var(--tab-shadow)]" : "glass-icon px-2.5 font-medium hover:text-text"}`}>
              <Icon size={16} strokeWidth={1.9} aria-hidden className="size-[15px] sm:size-4" />
              <span className={active ? "" : "hidden sm:inline"}>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-2 justify-self-end">
        <Link href="/hearings?filter=undecided" aria-label={alerts ? `${alerts} جلسات محتاجة قرار` : "التنبيهات"}
          className="glass glass-icon relative hidden size-[46px] items-center justify-center rounded-full sm:inline-flex">
          <Bell size={19} strokeWidth={1.9} aria-hidden />
          {alerts ? <span aria-hidden className="absolute end-2.5 top-2.5 size-2 rounded-full bg-gold" /> : null}
        </Link>
        <div ref={menu} className="relative">
          <button type="button" onClick={() => setOpen(!open)} aria-label="الحساب" aria-expanded={open}
            className="tap glass inline-flex size-[42px] items-center justify-center rounded-full text-sm font-bold text-text sm:size-[46px]">
            {initials}
          </button>
          {open ? (
            <div className="absolute end-0 top-14 z-50 w-64 rounded-lg border border-border-2 bg-card p-2 shadow-pop">
              <div className="px-3 py-2">
                <div className="truncate text-base leading-5 font-bold text-title">{officeName}</div>
                <div className="truncate text-sm leading-4 text-text-4" dir="ltr">{email}</div>
              </div>
              <div className="flex items-center justify-between px-3 py-1.5 text-base leading-5 text-text-2">المظهر <ThemeToggle /></div>
              <form action="/auth/signout" method="post">
                <button className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-base leading-5 text-text-2 hover:bg-card-2">
                  <LogOut size={16} strokeWidth={1.9} aria-hidden /> تسجيل الخروج
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
