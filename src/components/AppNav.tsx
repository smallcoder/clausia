"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const ITEMS = [
  { href: "/", label: "الرئيسية", icon: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" },
  { href: "/chat", label: "المساعد", icon: "M4 5h16v11H8l-4 4z" },
  { href: "/hearings", label: "الجلسات", icon: "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" },
  { href: "/cases", label: "القضايا", icon: "M4 6h6l2 2h8v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" },
];

function active(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** Desktop: right-hand sidebar. Mobile: bottom tab bar. */
export function AppNav({ officeName, userLabel }: { officeName: string; userLabel: string }) {
  const path = usePathname();
  return (
    <>
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-60 flex-col border-l border-line bg-surface lg:flex">
        <div className="px-5 pb-4 pt-6">
          <div className="text-lg font-bold tracking-tight text-accent">Clausia</div>
          <div className="mt-0.5 truncate text-xs text-ink-3">{officeName}</div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {ITEMS.map((it) => (
            <Link key={it.href} href={it.href}
              className={cx("flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition",
                active(path, it.href) ? "bg-accent-soft font-semibold text-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
              <Icon d={it.icon} />
              {it.label}
            </Link>
          ))}
        </nav>
        <form action="/auth/signout" method="post" className="border-t border-line px-5 py-4 text-xs text-ink-3">
          <div className="truncate">{userLabel}</div>
          <button className="mt-1 text-accent hover:underline">تسجيل الخروج</button>
        </form>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {ITEMS.map((it) => (
          <Link key={it.href} href={it.href}
            className={cx("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]", active(path, it.href) ? "font-semibold text-accent" : "text-ink-3")}>
            <Icon d={it.icon} />
            {it.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
