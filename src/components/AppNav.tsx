"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, FolderClosed, House, LogOut, MessageSquareText, type LucideIcon } from "lucide-react";
import { cx } from "./ui";

const ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "الرئيسية", icon: House },
  { href: "/chat", label: "المساعد", icon: MessageSquareText },
  { href: "/hearings", label: "الجلسات", icon: CalendarDays },
  { href: "/cases", label: "القضايا", icon: FolderClosed },
];

function active(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

/** Desktop: calm right-hand sidebar. Mobile: translucent top bar + bottom tab bar. */
export function AppNav({ officeName, userLabel }: { officeName: string; userLabel: string }) {
  const path = usePathname();
  const current = ITEMS.find((it) => active(path, it.href));
  return (
    <>
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-64 flex-col border-l border-hairline bg-paper lg:flex">
        <div className="px-6 pb-6 pt-8">
          <div className="text-[1.375rem] font-bold tracking-tight text-ink">Clausia</div>
          <div className="mt-0.5 truncate text-caption text-ink-3">{officeName}</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {ITEMS.map((it) => {
            const on = active(path, it.href);
            const Icon = it.icon;
            return (
              <Link key={it.href} href={it.href} aria-current={on ? "page" : undefined}
                className={cx("flex min-h-11 items-center gap-3 rounded-[var(--radius-sm)] px-3 text-body transition-colors duration-150",
                  on ? "bg-surface font-semibold text-accent shadow-1" : "text-ink-2 hover:bg-surface/60 hover:text-ink")}>
                <Icon aria-hidden size={20} strokeWidth={1.5} />
                {it.label}
              </Link>
            );
          })}
        </nav>
        <form action="/auth/signout" method="post" className="mx-3 mb-4 border-t border-hairline px-3 pt-4 text-caption text-ink-3">
          <div className="truncate">{userLabel}</div>
          <button className="mt-1 inline-flex min-h-9 items-center gap-1.5 text-accent hover:opacity-80">
            <LogOut aria-hidden size={15} strokeWidth={1.5} />
            تسجيل الخروج
          </button>
        </form>
      </aside>

      <header className="chrome sticky top-0 z-30 border-b border-hairline pt-[env(safe-area-inset-top)] lg:hidden">
        <div className="flex h-12 items-center justify-between px-4">
          <span className="text-callout font-semibold text-ink">{current?.label ?? "Clausia"}</span>
          <span className="truncate text-caption text-ink-3">{officeName || "Clausia"}</span>
        </div>
      </header>

      <nav className="chrome fixed inset-x-0 bottom-0 z-30 flex border-t border-hairline pb-[env(safe-area-inset-bottom)] lg:hidden">
        {ITEMS.map((it) => {
          const on = active(path, it.href);
          const Icon = it.icon;
          return (
            <Link key={it.href} href={it.href} aria-current={on ? "page" : undefined}
              className={cx("flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 text-[11px] transition-colors", on ? "font-semibold text-accent" : "text-ink-3")}>
              <Icon aria-hidden size={24} strokeWidth={on ? 1.9 : 1.5} />
              {it.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
