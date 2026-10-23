"use client";
/**
 * The chat-first split layout (docs/design/split/*). One centered frame (max 1600, 20px margins):
 *   desktop (≥1280): the top bar spans the whole frame; under it the page column on the start side (right in RTL) and the
 *   chat panel on the end side (left), always open (560px, 480 at 1440; the page shrinks first), a 24px gap between them.
 *   below 1280 (phone / tablet): the chat is the whole screen; the page opens as a bottom sheet over it.
 * The chat panel arrives as the @chat slot (it knows the context and the session from the URL); the composer's draft
 * lives here, so it survives moving between pages.
 *
 * When the sheet is open (below 1280): any page except Home and a case's own page (they ARE the chat's context); a case's
 * page opens with «افتح» (?sheet=1) or one of its views (?tab=…).
 */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { CitePanel } from "@/components/cite/CitePanel";
import { CONFIRM_SLOT } from "@/components/cases/ConfirmBar";
import { DraftProvider, type Account } from "@/components/chat/draft";
import { closeHref } from "@/components/shell/close-href";
import { DropProvider } from "@/components/shell/DropZone";
import { UndoToastProvider } from "@/components/shell/UndoToast";
import { cx } from "@/components/ui";

function sheetOpen(path: string, sp: URLSearchParams): boolean {
  if (sp.get("sheet") === "1") return true;
  if (path === "/") return false;
  return !(/^\/cases\/[^/]+\/?$/.test(path) && !sp.get("tab"));
}

export function SplitShell({ header, chat, account, children }: { header: ReactNode; chat: ReactNode; account: Account; children: ReactNode }) {
  const path = usePathname();
  const sp = useSearchParams();
  const open = sheetOpen(path, sp);
  return (
    <DraftProvider account={account}>
    <DropProvider>
    <UndoToastProvider>
      <div className="xl:px-5">
      <div className="xl:mx-auto xl:w-full xl:max-w-frame">
      {header}
      <div className="xl:flex xl:items-start xl:gap-6">
        {/* the page: a column on desktop, a bottom sheet below 1280 (only when it is open) */}
        {open ? <Link href={closeHref(path, sp)} aria-label="رجوع للشات" className="fixed inset-0 z-30 xl:hidden" /> : null}
        <div className={cx(
          "min-w-0 flex-1 flex-col xl:flex xl:page-min-height",
          "max-xl:fixed max-xl:inset-x-0 max-xl:bottom-0 max-xl:top-48 max-xl:z-40 max-xl:overflow-y-auto max-xl:overscroll-contain max-xl:rounded-t-xl glass-below-xl",
          open ? "sheet-enter flex" : "max-xl:hidden",
        )}>
          <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border-strong xl:hidden" />
          <main className="flex w-full flex-1 flex-col pb-12 pt-3 xl:pb-page-end xl:pt-0">{children}</main>
          <div className="sticky bottom-0 glass-fill mt-4 flex items-center gap-2 px-4 pb-[calc(14px+env(safe-area-inset-bottom))] pt-3 xl:hidden" /* ds-allow: safe-area inset needs calc() */>
            {/* a page with edits waiting puts «أكّد · N» here (ConfirmBar): one bar with «رجوع للشات» */}
            <div id={CONFIRM_SLOT} className="min-w-0 flex-2 empty:hidden" />
            <Link href={closeHref(path, sp)} className="tap glass glass-icon flex h-control-xl min-w-0 flex-1 items-center justify-center rounded-full text-base font-semibold">رجوع للشات</Link>
          </div>
        </div>
        {chat}
      </div>
      </div>
      </div>
      <CitePanel />
    </UndoToastProvider>
    </DropProvider>
    </DraftProvider>
  );
}
