"use client";
/**
 * The sidebar (docs/design/ia: SBC*, MDrawer*): logo · search · nav (الرئيسية الأجندة الموكلين المكتبة) · القضايا (each case opens to «ملف القضية»,
 * its sessions and «+ محادثة جديدة») · محادثات عامة · the bell and the account at the bottom.
 * One component, three looks, by CSS only:
 *   1441 and wider: 264px, part of the glass surface with the chat;
 *   1280 to 1440 (`rail:`): 72px, icons only (the cases are letter tiles; texts stay for screen readers);
 *   below 1280: a side drawer (≡ in the chat header), solid, over a dim layer.
 * Data comes from the layout (lib/sidebar.ts); the open session comes from the chat panel through the shell context.
 */
import { Bell, BookOpen, CalendarDays, CalendarOff, ChevronDown, FolderClosed, House, LogOut, MessageSquare, Search, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useDraft } from "@/components/chat/draft";
import { shortDay } from "@/components/chat/panel-types";
import { AGENDA, DECIDE_HREF } from "@/components/agenda/url";
import { DateText, cx } from "@/components/ui";
import { askPermission } from "@/lib/brief/notify";
import type { SideCase, SideData, SideSession } from "@/lib/sidebar";
import { ClausiaMark } from "./ClausiaMark";
import { useShell } from "./ShellContext";
import { ThemeToggle } from "./ThemeToggle";
import { useBriefBell } from "./useBriefBell";

const NAV = [
  { href: "/", label: "الرئيسية", Icon: House },
  { href: AGENDA, label: "الأجندة", Icon: CalendarDays },
  { href: "/clients", label: "الموكلين", Icon: Users },
  { href: "/library", label: "المكتبة", Icon: BookOpen },
];

/** Which nav item the path belongs to (the brief is an agenda page; the chat threads opened from it are Home). */
function activeNav(path: string): string | null {
  if (path.startsWith(AGENDA) || path.startsWith("/brief")) return AGENDA;
  if (path.startsWith("/clients")) return "/clients";
  if (path.startsWith("/library")) return "/library";
  if (path === "/" || path.startsWith("/chat")) return "/";
  return null; // a case page or the cases list: the cases section shows where we are
}

const row = "tap flex items-center gap-2.5 rounded-md text-text-2 transition hover:bg-border-2";
const railCenter = "rail:justify-center rail:px-0";
/** hides a text in the icon sidebar but keeps it for screen readers */
const label = "rail:sr-only";

interface Props {
  data: SideData;
  initials: string;
  displayName: string;
  officeName: string;
  email: string;
  alerts: number;
  userId: string;
  holidays: boolean;
}

export function Sidebar({ data, initials, displayName, officeName, email, alerts, userId, holidays }: Props) {
  const path = usePathname();
  const sp = useSearchParams();
  const { drawer, setDrawer, setFull, openThread } = useShell();
  const { focusComposer } = useDraft();
  const [query, setQuery] = useState("");
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const menuBox = useRef<HTMLDivElement>(null);

  const { items: briefItems, opened } = useBriefBell(userId, path);
  const brief = briefItems[0];
  const caseId = path.match(/^\/cases\/([^/]+)/)?.[1] ?? null;
  const onNav = activeNav(path);
  /** a general chat keeps its open session when the lawyer moves between the nav pages (a case's sessions are its own) */
  const general = !caseId ? sp.get("s") : null;
  const navHref = (href: string) => (general ? `${href}?s=${general}` : href);

  // the drawer closes when the lawyer goes somewhere
  useEffect(() => { setDrawer(false); setMenu(false); }, [path, sp, setDrawer]);

  // ⌘K (Ctrl+K): the search box; in the icon sidebar there is no box, so it goes to the chat's input; on the phone it opens the drawer first
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); focusSearch(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  function focusSearch() {
    const el = search.current;
    if (el && el.offsetParent !== null) { el.focus(); return; }
    if (window.matchMedia("(min-width: 80rem)").matches) { focusComposer(); return; }
    setDrawer(true);
    requestAnimationFrame(() => search.current?.focus());
  }

  // the account menu closes on a click outside and on Escape; Escape also closes the drawer
  useEffect(() => {
    const out = (e: MouseEvent) => { if (menu && !menuBox.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenu(false); setDrawer(false); } };
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", esc); };
  }, [menu, setDrawer]);

  const q = query.trim().toLowerCase();
  const hit = (s: string) => s.toLowerCase().includes(q);
  const cases = q ? data.cases.filter((c) => hit(c.name) || hit(c.sub) || c.sessions.some((s) => hit(s.title))) : data.cases;
  const generalSessions = q ? data.general.filter((s) => hit(s.title)) : data.general;
  const isOpen = (c: SideCase) => (q ? true : toggled[c.id] ?? c.id === caseId);
  /** the page is shown again when the lawyer goes to a page link while the chat is full screen */
  const showPage = () => setFull(false);

  const sessionHref = (c: string | null, id: string) => (c ? `/cases/${c}?s=${id}` : `/?s=${id}`);
  const sessionOn = (c: string | null, id: string) => openThread === id && (c ? caseId === c : !caseId);
  const sessionLabel = (s: SideSession) => (s.hearingDate ? <DateText value={`جلسة ${shortDay(s.hearingDate)}`} /> : s.title);

  const firstWord = (n: string) => n.replace(/^(أ\.|أستاذ|الأستاذ)\s*/u, "").trim().slice(0, 1) || "ق";
  const attention = alerts ? `${alerts} جلسات محتاجة قرار` : null;

  return (
    <>
      {drawer ? <button type="button" aria-label="اقفل القائمة" tabIndex={-1} onClick={() => setDrawer(false)} className="fade-enter fixed inset-0 z-40 bg-backdrop xl:hidden" /> : null}
      <nav aria-label="القائمة"
        className={cx(
          "min-h-0 flex-col xl:flex xl:w-sidebar xl:shrink-0 xl:border-e xl:border-border-2 rail:w-rail",
          "max-xl:fixed max-xl:inset-y-0 max-xl:start-0 max-xl:z-50 max-xl:w-80 max-xl:max-w-7/8 max-xl:bg-bg max-xl:shadow-pop max-xl:pt-[env(safe-area-inset-top)] max-xl:pb-[env(safe-area-inset-bottom)]", // ds-allow: safe-area insets need env()
          drawer ? "fade-enter flex" : "max-xl:hidden",
        )}>
        {/* logo */}
        <Link href="/" onClick={showPage} aria-label="Clausia — الرئيسية" className={cx("tap flex items-center gap-2.5 px-4.5 pb-3 pt-4.5", railCenter)}>
          <ClausiaMark size={34} />
          <span className={cx("min-w-0 leading-[1.15]", label)}>
            <span className="font-num block text-lg font-bold text-title">Clausia</span>
            {officeName ? <span className="block truncate text-xs text-text-4">{officeName}</span> : null}
          </span>
        </Link>

        {/* search: the cases and sessions below, and ⌘K */}
        <div className="px-3.5 pb-2.5 rail:px-2">
          <label className="focus-host flex h-control items-center gap-2 rounded-md border border-border-2 px-3 text-text-3 rail:hidden">
            <Search aria-hidden size={15} strokeWidth={1.8} className="shrink-0" />
            <input ref={search} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="دوّر في أي حاجة" aria-label="دوّر في القضايا والمحادثات"
              className="bare-field min-w-0 flex-1 bg-transparent text-base text-text placeholder:text-text-3" />
            <kbd aria-hidden className="font-num text-xs opacity-80">⌘K</kbd>
          </label>
          <button type="button" onClick={focusSearch} aria-label="دوّر في أي حاجة" title="دوّر في أي حاجة ⌘K"
            className="tap hidden size-control w-full items-center justify-center rounded-md border border-border-2 text-text-3 rail:flex">
            <Search aria-hidden size={16} strokeWidth={1.8} />
          </button>
        </div>

        {/* nav */}
        <ul className="flex flex-col gap-0.5 px-2.5">
          {NAV.map(({ href, label: text, Icon }) => {
            const on = onNav === href;
            const badge = href === AGENDA && alerts > 0 ? alerts : 0;
            return (
              <li key={href}>
                <Link href={navHref(href)} onClick={showPage} aria-current={on ? "page" : undefined} title={text}
                  className={cx(row, "relative h-control px-3 text-base", railCenter, on ? "side-on font-semibold" : "font-medium")}>
                  <Icon aria-hidden size={17} strokeWidth={1.8} className="shrink-0" />
                  <span className={cx("flex-1", label)}>{text}</span>
                  {badge ? (
                    <span aria-label={attention ?? undefined}
                      className="font-num inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-bg px-1.5 text-xs font-bold text-gold-on-ambient rail:absolute rail:end-1 rail:top-0.5 rail:h-4 rail:min-w-4 rail:px-1">{badge}</span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* cases + general sessions: the only part that scrolls */}
        <div className="mt-1 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-2.5 pb-3">
          <div className="flex items-center justify-between px-2.5 pb-1.5 pt-3.5 rail:hidden">
            <Link href="/cases" onClick={showPage} className="tap text-sm font-bold text-text-3">القضايا</Link>
            <Link href={`/?s=new&q=${encodeURIComponent("افتح قضية جديدة: ")}`} onClick={showPage} className="tap text-sm text-text-3 hover:text-text">+ جديدة</Link>
          </div>

          {/* full list (264 and the drawer) */}
          <ul className="flex flex-col gap-0.5 rail:hidden">
            {cases.map((c) => {
              const open = isOpen(c);
              const here = c.id === caseId;
              return (
                <li key={c.id}>
                  <button type="button" aria-expanded={open} onClick={() => setToggled((t) => ({ ...t, [c.id]: !open }))}
                    className={cx(row, "w-full px-2.5 py-2 text-start", here && "bg-border-2")}>
                    <ChevronDown aria-hidden size={13} strokeWidth={2.2} className={cx("shrink-0 text-text-4 transition-transform", !open && "rotate-90")} />
                    <span className="min-w-0 flex-1 leading-[1.35]">
                      <span className="block truncate text-base font-semibold text-text">{c.name}</span>
                      {c.sub ? <span className="block truncate text-sm text-text-3">{c.sub}</span> : null}
                    </span>
                    {c.needsDecision ? <><span aria-hidden className="size-dot-lg shrink-0 rounded-full bg-gold" /><span className="sr-only">محتاجة قرار</span></> : null}
                  </button>
                  {open ? (
                    <ul className="ms-5.5 mt-0.5 mb-1.5 flex flex-col gap-px border-s border-border-2 ps-2.5">
                      <li>
                        <Link href={`/cases/${c.id}`} onClick={showPage} className={cx(row, "px-2.5 py-1.5 text-sm")}>
                          <FolderClosed aria-hidden size={14} strokeWidth={1.8} className="shrink-0" />ملف القضية
                        </Link>
                      </li>
                      {c.sessions.map((s) => (
                        <li key={s.id}>
                          <Link href={sessionHref(c.id, s.id)} aria-current={sessionOn(c.id, s.id) ? "true" : undefined}
                            className={cx(row, "px-2.5 py-1.5 text-sm", sessionOn(c.id, s.id) && "side-on")}>
                            <MessageSquare aria-hidden size={13} strokeWidth={1.8} className="shrink-0" />
                            <span className="min-w-0 truncate">{sessionLabel(s)}</span>
                          </Link>
                        </li>
                      ))}
                      <li><Link href={`/cases/${c.id}?s=new`} className="tap block px-2.5 py-1.5 text-sm text-text-4 hover:text-text">+ محادثة جديدة</Link></li>
                    </ul>
                  ) : null}
                </li>
              );
            })}
            {cases.length === 0 ? <li className="px-2.5 py-2 text-sm text-text-4">{q ? "مفيش قضية بالاسم ده." : "مفيش قضايا لسه."}</li> : null}
          </ul>

          {/* icon list (1280 to 1440): a letter tile per case, with the gold dot */}
          <ul aria-label="القضايا" className="mt-2 hidden flex-col items-center gap-1.5 border-t border-border-2 pt-3 rail:flex">
            {data.cases.slice(0, 12).map((c) => (
              <li key={c.id}>
                <Link href={`/cases/${c.id}`} onClick={showPage} title={c.name} aria-label={c.name} aria-current={c.id === caseId ? "page" : undefined}
                  className={cx("tap relative flex size-control items-center justify-center rounded-md bg-card-2 text-base font-bold text-text transition hover:bg-card-3", c.id === caseId && "side-on")}>
                  {firstWord(c.name)}
                  {c.needsDecision ? <span aria-hidden className="absolute end-0.5 top-0.5 size-dot rounded-full bg-gold" /> : null}
                </Link>
              </li>
            ))}
          </ul>

          <div className="px-2.5 pb-1.5 pt-4.5 text-sm font-bold text-text-3 rail:hidden">محادثات عامة</div>
          <ul className="flex flex-col gap-px rail:hidden">
            {generalSessions.map((s) => (
              <li key={s.id}>
                <Link href={sessionHref(null, s.id)} aria-current={sessionOn(null, s.id) ? "true" : undefined}
                  className={cx(row, "px-2.5 py-1.5 text-sm", sessionOn(null, s.id) && "side-on")}>
                  <MessageSquare aria-hidden size={13} strokeWidth={1.8} className="shrink-0" />
                  <span className="min-w-0 truncate">{sessionLabel(s)}</span>
                </Link>
              </li>
            ))}
            <li><Link href="/?s=new" onClick={showPage} className="tap block px-2.5 py-1.5 text-sm text-text-4 hover:text-text">+ محادثة جديدة</Link></li>
          </ul>
        </div>

        {/* the bell and the account */}
        <div ref={menuBox} className="relative flex items-center gap-1 border-t border-border-2 p-3 rail:flex-col rail:p-2">
          <button type="button" onClick={() => setMenu(!menu)} aria-haspopup="true" aria-expanded={menu} aria-label="الحساب"
            className="tap flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-1 text-start transition hover:bg-border-2 rail:flex-none rail:justify-center">
            <span className="inline-flex size-control shrink-0 items-center justify-center rounded-full border border-border bg-chip text-sm font-bold text-text">{initials}</span>
            <span className={cx("min-w-0 flex-1 truncate text-base font-semibold text-text", label)}>{displayName || officeName}</span>
          </button>
          {/* the bell asks for notification permission when it is tapped (never on load); with a brief ready it opens it */}
          <Link href={brief ? brief.href : DECIDE_HREF} onClick={() => { void askPermission(); if (brief) opened(brief); showPage(); }}
            aria-label={brief ? brief.label : attention ?? "التنبيهات"} title={brief ? brief.label : attention ?? "التنبيهات"}
            className="tap relative inline-flex size-control shrink-0 items-center justify-center rounded-full text-text-3 transition hover:text-text">
            <Bell aria-hidden size={18} strokeWidth={1.8} />
            {alerts || brief ? <span aria-hidden className="absolute end-2 top-2 size-dot-lg rounded-full bg-gold" /> : null}
          </Link>

          {menu ? (
            <div className="absolute inset-x-3 bottom-full z-30 mb-1 rounded-lg border border-border-2 bg-card p-2 shadow-pop rail:inset-x-auto rail:start-2 rail:w-64">
              <div className="px-3 py-2">
                <div className="truncate text-base leading-5 font-bold text-title">{officeName}</div>
                <div className="truncate text-sm leading-4 text-text-4" dir="ltr">{email}</div>
              </div>
              <div className="flex items-center justify-between px-3 py-1.5 text-base leading-5 text-text-2">المظهر <ThemeToggle /></div>
              <Soon>الإعدادات</Soon>
              {holidays ? (
                <Link href="/settings/holidays" onClick={() => { setMenu(false); showPage(); }} className={menuRow}>
                  <CalendarOff size={16} strokeWidth={1.9} aria-hidden /> إجازات المحاكم
                </Link>
              ) : null}
              <Soon>الفريق</Soon>
              <Soon>ورق المكتب</Soon>
              <form action="/auth/signout" method="post">
                <button className={cx(menuRow, "w-full")}><LogOut size={16} strokeWidth={1.9} aria-hidden /> تسجيل الخروج</button>
              </form>
            </div>
          ) : null}
        </div>
      </nav>
    </>
  );
}

const menuRow = "flex min-h-11 items-center gap-2 rounded-md px-3 text-base leading-5 text-text-2 hover:bg-card-2";

/** A menu item whose page comes in a later step: shown, not a link. */
function Soon({ children }: { children: ReactNode }) {
  return (
    <div aria-disabled="true" className="flex min-h-11 items-center gap-2 rounded-md px-3 text-base leading-5 text-text-4">
      <span className="flex-1">{children}</span><span className="text-xs">قريباً</span>
    </div>
  );
}
