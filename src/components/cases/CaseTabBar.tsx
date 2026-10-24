"use client";
/**
 * The dossier's tab bar (docs/design/ia/IACase*, MCase*): five links under the header, each with its number; the active one is
 * underlined. The tab is the address (`?tab=`), so a tab can be linked and the back button works. On a phone the bar scrolls
 * sideways (no scrollbar) and brings the active tab into view. A gold dot on a tab: something there waits for the lawyer.
 */
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useTabs } from "@/components/cases/CaseTabs";
import { TABS, tabHref, type TabKey } from "@/components/cases/dossier";
import { LinkPending } from "@/components/shell/LinkPending";

export function CaseTabBar({ caseId, active: current, counts, keep }: {
  caseId: string; active: TabKey; counts: Record<TabKey, { text: string; gold: boolean }>;
  /** the parts of the address that stay when the tab changes (the chat session) */
  keep: Record<string, string | undefined>;
}) {
  const { pending, click } = useTabs();
  const active = pending ?? current; // the clicked tab is active at once
  const on = useRef<HTMLAnchorElement>(null);
  useEffect(() => { on.current?.scrollIntoView({ inline: "nearest", block: "nearest" }); }, [active]);
  return (
    <nav aria-label="أقسام القضية" className="no-scrollbar mt-5 flex gap-1 overflow-x-auto border-b border-border-2">
      {TABS.map((t) => {
        const is = t.key === active;
        return (
          <Link key={t.key} ref={is ? on : undefined} href={tabHref(caseId, t.key, keep)} scroll={false} onClick={() => click(t.key)} aria-current={is ? "page" : undefined}
            className={`tap -mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-base transition-colors sm:px-4 sm:text-md ${is ? "border-title font-bold text-title" : "border-transparent font-medium text-text-3 hover:text-text"}`}>
            {t.label}
            <span className="font-num text-sm text-text-3">{counts[t.key].text}</span>
            {counts[t.key].gold ? <span aria-hidden className="size-dot rounded-full bg-gold" /> : null}
            {counts[t.key].gold ? <span className="sr-only">محتاجة مراجعة</span> : null}
            <LinkPending />
          </Link>
        );
      })}
    </nav>
  );
}
