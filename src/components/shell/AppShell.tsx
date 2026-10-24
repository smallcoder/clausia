"use client";
/**
 * The app's layout (docs/design/ia: SBC*, SBF*, MDrawer*, MChat*). No top bar: the logo is in the sidebar.
 *   desktop (1280 and up): one centered frame (max 1800, 20px margins). On the end side (the right) ONE glass surface = the sidebar (288, or 72 as icons
 *   up to 1440) + the chat (560; 480 beside the icons) attached to it with no gap; the page beside it (about 950 wide at 1920). «Full screen» hides the
 *   page and the chat takes the whole frame (its messages column is 520, centered); the choice is remembered per user (ShellContext).
 *   below 1280 (phone / tablet): the chat is the whole screen; the sidebar is a side drawer (≡ in the chat header); the page opens as a bottom sheet over the chat.
 * The chat arrives as the @chat slot (it knows the context and the session from the URL); the composer's draft lives here, so it survives moving between pages.
 *
 * When the sheet is open (below 1280): any page except Home, a case's own page and a client's own page (they ARE the chat's context); a case's or
 * a client's page opens with «افتح» (?sheet=1) or one of its views (?tab=…).
 */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { CitePanel } from "@/components/cite/CitePanel";
import { CONFIRM_SLOT } from "@/components/cases/ConfirmBar";
import { DraftProvider, type Account } from "@/components/chat/draft";
import { closeHref } from "@/components/shell/close-href";
import { DropProvider } from "@/components/shell/DropZone";
import { ShellProvider, useShell } from "@/components/shell/ShellContext";
import { Sidebar } from "@/components/shell/Sidebar";
import { UndoToastProvider } from "@/components/shell/UndoToast";
import { useScrollbars } from "@/components/shell/useScrollbars";
import { cx } from "@/components/ui";
import type { SideData } from "@/lib/sidebar";

function sheetOpen(path: string, sp: URLSearchParams): boolean {
  if (sp.get("sheet") === "1") return true;
  if (path === "/") return false;
  return !(/^\/(cases|clients)\/[^/]+\/?$/.test(path) && !sp.get("tab"));
}

export interface ShellUser { id: string; initials: string; displayName: string; officeName: string; email: string }

export function AppShell({ user, side, alerts, holidays, chat, children }: { user: ShellUser; side: SideData; alerts: number; holidays: boolean; chat: ReactNode; children: ReactNode }) {
  const account: Account = { officeName: user.officeName, email: user.email };
  return (
    <DraftProvider account={account}>
    <DropProvider>
    <UndoToastProvider>
    <ShellProvider userId={user.id}>
      <Frame user={user} side={side} alerts={alerts} holidays={holidays} chat={chat}>{children}</Frame>
      <CitePanel />
    </ShellProvider>
    </UndoToastProvider>
    </DropProvider>
    </DraftProvider>
  );
}

function Frame({ user, side, alerts, holidays, chat, children }: { user: ShellUser; side: SideData; alerts: number; holidays: boolean; chat: ReactNode; children: ReactNode }) {
  const path = usePathname();
  const sp = useSearchParams();
  const { full } = useShell();
  useScrollbars(); // thin scrollbars, shown only while scrolling
  const open = sheetOpen(path, sp);
  return (
    <div className="xl:px-5">
      {full ? null : <a href="#page" className="sr-only max-xl:hidden focus:not-sr-only focus:fixed focus:start-6 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3.5 focus:py-2 focus:text-base focus:font-semibold focus:text-text focus:shadow-pop">انتقل لمحتوى الصفحة</a>}
      <div className="xl:mx-auto xl:flex xl:w-full xl:max-w-frame xl:items-start xl:py-6">
        {/* the surface: sidebar, then the chat (the @chat slot). Below 1280 it dissolves: the sidebar is a drawer and the chat is the whole screen */}
        <div className={cx("max-xl:contents xl:sticky xl:top-6 xl:flex xl:shell-height xl:min-w-0 xl:overflow-hidden xl:rounded-xl glass-xl", full ? "xl:flex-1" : "xl:shrink-0")}>
          <Sidebar data={side} initials={user.initials} displayName={user.displayName} officeName={user.officeName} email={user.email} alerts={alerts} userId={user.id} holidays={holidays} />
          {chat}
        </div>

        {/* the page: a column beside the surface on desktop (hidden when the chat is full screen), a bottom sheet below 1280 (only when it is open) */}
        {open ? <Link href={closeHref(path, sp)} aria-label="رجوع للشات" className="fade-enter fixed inset-0 z-30 bg-backdrop xl:hidden" /> : null}
        <div className={cx(
          "min-w-0 flex-1 flex-col xl:page-min-height",
          "max-xl:fixed max-xl:inset-x-0 max-xl:bottom-0 max-xl:top-48 max-xl:z-40 max-xl:overflow-y-auto max-xl:overscroll-contain max-xl:rounded-t-xl max-xl:bg-bg max-xl:shadow-pop",
          open ? "sheet-enter flex" : "max-xl:hidden",
          full ? "xl:hidden" : "xl:flex",
        )}>
          <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border-strong xl:hidden" />
          <main id="page" tabIndex={-1} className="flex w-full flex-1 flex-col pb-page-end pt-3 xl:pt-0">{children}</main>
          <div className="sticky bottom-0 mt-4 flex items-center gap-2 border-t border-border-2 bg-bg px-4 pb-[calc(14px+env(safe-area-inset-bottom))] pt-3 xl:hidden" /* ds-allow: safe-area inset needs calc() */>
            {/* a page with edits waiting puts «أكّد · N» here (ConfirmBar): one bar with «رجوع للشات» */}
            <div id={CONFIRM_SLOT} className="min-w-0 flex-2 empty:hidden" />
            <Link href={closeHref(path, sp)} className="tap glass-flat glass-icon flex h-control-xl min-w-0 flex-1 items-center justify-center rounded-full text-base font-semibold">رجوع للشات</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
