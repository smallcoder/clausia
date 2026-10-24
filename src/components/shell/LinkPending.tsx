"use client";
/**
 * A small ring inside a <Link>: it turns on while that link's navigation is pending (useLinkStatus), after a 100ms delay (globals.css .link-pending),
 * so a navigation that is instant never flashes it. It must be a child of the Link.
 */
import { useLinkStatus } from "next/link";
import { cx } from "@/components/ui";

export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={cx("link-pending", pending && "is-pending", className)} />;
}

/** True for a click that really navigates in this tab. A Cmd / Ctrl / Shift / Alt or middle click opens elsewhere and Next skips the navigation, so nothing optimistic may start. */
export function isPlainClick(e: MouseEvent | React.MouseEvent): boolean {
  return !(e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0);
}
