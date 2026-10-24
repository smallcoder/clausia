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
