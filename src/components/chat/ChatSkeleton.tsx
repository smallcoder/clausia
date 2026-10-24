"use client";
/**
 * The chat panel while its data loads (the @chat slot's loading.tsx): the same box as ChatPanel (width, header line, composer shell), with solid
 * shapes. It keeps the glass surface from jumping, so a click on the sidebar shows the new page's skeleton and this one at once.
 */
import { Bar } from "@/components/shell/PageSkeleton";
import { useShell } from "@/components/shell/ShellContext";
import { cx } from "@/components/ui";

export function ChatSkeleton() {
  const { full } = useShell();
  return (
    <aside role="status" aria-busy="true" aria-label="جارٍ تحميل المحادثة"
      className={cx("skel-shimmer flex min-w-0 flex-col max-xl:fixed max-xl:inset-0 xl:min-h-0", full ? "xl:flex-1" : "xl:w-chat xl:shrink-0 rail:w-chat-rail")}>
      <div className="hidden items-center gap-2.5 border-b border-border-2 px-4.5 py-4 xl:flex">
        <div className="flex-1 space-y-2"><Bar w="150px" h={15} /><Bar w="190px" h={11} /></div>
        <Bar w="34px" h={34} className="rounded-full" />
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-messages flex-1 flex-col gap-4 px-4 pt-6 xl:px-4.5">
        <Bar w="70%" h={14} /><Bar w="45%" h={14} />
        <Bar w="55%" h={38} className="self-end rounded-lg" />
      </div>
      <div className="px-2.5 pb-3.5 pt-1 xl:px-4.5 xl:pt-3">
        <div className="mx-auto w-full max-w-messages rounded-xl border border-border-2 p-2.5"><Bar w="100%" h={44} className="rounded-lg" /></div>
      </div>
    </aside>
  );
}
