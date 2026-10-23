"use client";
/**
 * The chat panel (docs/design/ia: SBC*, SBF*, MChat*): the app's chat, always there. Desktop: attached to the sidebar (480 wide; the shell draws the glass
 * around both), with its own header (who this chat is about; the title opens the sessions list; the expand button makes it full screen). Phone: the whole
 * screen — a header with ≡ (the sidebar drawer), the context pill (opens the context picker) and, inside a case, a button for the page, and a small case strip
 * with «افتح» (it opens the page as a sheet). Data comes from the @chat slot (panel-data.ts) for the current URL.
 */
import { ChevronDown, FolderClosed, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { moveThreadAction } from "@/lib/assistant/actions";
import { ChatThread } from "./ChatThread";
import { ContextPicker } from "./ContextPicker";
import { SessionsMenu } from "./Sessions";
import type { PanelData } from "./panel-types";
import { useShell } from "@/components/shell/ShellContext";
import { DateText, cx } from "@/components/ui";
import { formatDmy } from "@/lib/dates";

export function ChatPanel({ data }: { data: PanelData }) {
  const { context, sessions, threadId, hearing, thread, moveOffer, chips, morning, starter } = data;
  const caseId = context.kind === "case" ? context.id : null;
  const clientId = context.kind === "client" ? context.id : null;
  const path = usePathname();
  const params = useSearchParams();
  const [picker, setPicker] = useState(false);
  const { full, setFull, setDrawer, setOpenThread } = useShell();
  // the sidebar marks the open session
  useEffect(() => { setOpenThread(threadId); return () => setOpenThread(null); }, [threadId, setOpenThread]);

  const who = context.kind === "case" ? `في قضية ${context.name}` : context.kind === "client" ? `الموكل · ${context.name}` : "محادثة عامة";
  // the small line under the title, from the sessions list the panel already has (never invented: none = no line)
  const sub = sessions.length ? // «N محادثات» for every N (owner 2026-10-23)
     `${sessions.length} محادثات${caseId ? " في القضية" : ""} · آخر محادثة ${formatDmy(sessions[0].day)}` : null;
  const sheetHref = (() => { const p = new URLSearchParams(params.toString()); p.set("sheet", "1"); return `${path}?${p.toString()}`; })();

  return (
    <aside aria-label="محادثة Clausia" className={cx("flex min-w-0 flex-col max-xl:fixed max-xl:inset-0 xl:min-h-0", full ? "xl:flex-1" : "xl:w-chat xl:shrink-0")}>
      <div className="flex min-h-0 flex-1 flex-col">
        {/* desktop header: who this chat is about; the title opens the sessions of THIS context; the expand button makes the chat full screen */}
        <SessionsMenu sessions={sessions} currentId={threadId} title={who} sub={sub} full={full} onFull={setFull} inCase={context.kind !== "general"} openLabel={clientId ? "افتح ملف الموكل" : "افتح ملف القضية"} />

        {/* phone header: ≡ (the sidebar), the context pill, and (in a case) a button that opens the page */}
        <div className="flex items-center gap-2 px-3.5 pb-2.5 pt-[calc(14px+env(safe-area-inset-top))] xl:hidden" /* ds-allow: safe-area inset needs calc() */>
          <button type="button" onClick={() => setDrawer(true)} aria-label="القائمة" className="tap glass glass-icon inline-flex size-10 items-center justify-center rounded-full"><Menu aria-hidden size={19} strokeWidth={1.8} /></button>
          <button type="button" onClick={() => setPicker(true)} aria-haspopup="dialog" aria-label="اختار المحادثة"
            className="tap glass flex h-10 min-w-0 items-center gap-2 rounded-full pe-3.5 ps-2 text-base font-bold text-text">
            <span aria-hidden className="mark font-num inline-flex size-mark shrink-0 items-center justify-center rounded-sm text-sm font-extrabold">C</span>
            <span className="truncate">{context.kind !== "general" ? context.pill : "محادثة عامة"}</span>
            <ChevronDown aria-hidden size={16} strokeWidth={1.9} className="shrink-0 text-glass-icon" />
          </button>
          <div className="flex-1" />
          {caseId || clientId ? <Link href={sheetHref} aria-label={clientId ? "افتح ملف الموكل" : "افتح ملف القضية"} className="tap glass glass-icon inline-flex size-10 items-center justify-center rounded-full"><FolderClosed aria-hidden size={19} strokeWidth={1.8} /></Link> : null}
        </div>

        {context.kind !== "general" ? (
          <div className="px-4 pb-1 xl:hidden">
            <Link href={sheetHref} className="flex items-center gap-2.5 rounded-lg border border-border-2 bg-card px-3.5 py-2.5 shadow-soft">
              <span aria-hidden className="mark inline-flex size-mark-lg shrink-0 items-center justify-center rounded-sm"><FolderClosed size={16} strokeWidth={1.9} /></span>
              <span className="min-w-0 flex-1 leading-[normal]">
                <span className="block truncate text-base font-bold text-text">{context.strip.title}</span>
                {context.strip.meta ? <span className="mt-px block truncate text-sm text-text-3"><DateText value={context.strip.meta} /></span> : null}
              </span>
              <span className="text-sm font-semibold text-gold">افتح</span>
            </Link>
          </div>
        ) : null}

        {moveOffer && threadId ? <MoveOffer key={threadId} threadId={threadId} caseId={moveOffer.caseId} label={moveOffer.label} /> : null}

        <ChatThread key={threadId ?? "new"} threadId={threadId} caseId={caseId} clientId={clientId} hearing={hearing} items={thread?.items ?? []} lookup={thread?.lookup ?? {}} rows={thread?.rows ?? {}} deadlines={thread?.deadlines ?? {}} docs={thread?.docs ?? {}} chips={chips} morning={morning} starter={starter} />
      </div>
      {picker ? <ContextPicker currentCaseId={caseId} currentSessionId={threadId} onClose={() => setPicker(false)} /> : null}
    </aside>
  );
}

/** «انقل المحادثة دي لقضية X»: a general session whose cards point at a case. Only the lawyer's tap moves it. */
function MoveOffer({ threadId, caseId, label }: { threadId: string; caseId: string; label: string }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (hidden) return null;
  function move() {
    setError(null);
    start(async () => {
      const r = await moveThreadAction(threadId, caseId);
      if (r.ok) router.push(`/cases/${caseId}?s=${threadId}`);
      else setError(r.error ?? "تعذّر النقل");
    });
  }
  return (
    <div className="mx-auto w-full max-w-messages px-4 pt-3 xl:px-4.5">
      <div className="flex items-center gap-2 rounded-lg border border-gold-edge bg-gold-bg px-3.5 py-2">
        <p className="min-w-0 flex-1 text-base text-text">{error ?? <>انقل المحادثة دي لقضية <span className="font-bold">{label}</span></>}</p>
        <button type="button" onClick={move} disabled={pending} className="tap inline-flex h-8 shrink-0 items-center rounded-full bg-selected px-3.5 text-sm font-semibold text-on-selected disabled:opacity-50">انقل</button>
        <button type="button" onClick={() => setHidden(true)} className="tap inline-flex h-8 shrink-0 items-center rounded-full px-2.5 text-sm font-semibold text-text-3 hover:text-text">لا</button>
      </div>
    </div>
  );
}
