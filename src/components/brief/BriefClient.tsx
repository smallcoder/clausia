"use client";
/**
 * The brief page's two client pieces:
 *  - BriefSettings: the «الإعدادات» pill (title row, desktop). Tapping it asks the browser for permission to show
 *    notifications (the only place besides the bell that asks) and says in a small panel what the state is.
 *  - BriefComposer: the three chips at the bottom of the page.
 *      «اكتبلي مذكرة …»   a link: opens that case's chat with the sentence in the box (nothing is sent)
 *      «ابعت الملخص ده واتساب»  a link to WhatsApp's share page (wa.me) with the summary typed in, in a new tab. DRAFT ONLY:
 *                         the lawyer picks who gets it and taps send in WhatsApp; Clausia sends nothing
 *      «ذكّرني الصبح 7»   saves a reminder for 07:00 Cairo of the hearings day; a toast with «تراجع» (undo), then «اتلغى»
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { Bell, FileText } from "lucide-react";
import Link from "next/link";
import { briefSeenAction, setReminderAction, undoReminderAction } from "@/lib/brief/actions";
import { askPermission, type NotifyState } from "@/lib/brief/notify";

/** opening the brief of a day is how a due reminder for that day is «seen» (the bell stops showing it) */
export function BriefSeen({ date }: { date: string }) {
  useEffect(() => { void briefSeenAction(date); }, [date]);
  return null;
}

const NOTE: Record<NotifyState, string> = {
  granted: "إشعارات المتصفح شغّالة. هتظهرلك لو Clausia مفتوحة في تبويب.",
  denied: "المتصفح مانع الإشعارات. فعّلها من إعدادات الموقع في المتصفح.",
  default: "لسه ما سمحتش بإشعارات المتصفح.",
  unsupported: "المتصفح ده مش بيدعم الإشعارات. هتلاقي التنبيه في الجرس.",
};

export function BriefSettings() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<NotifyState>("unsupported");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) setState(await askPermission()); // asked on the tap, never on load
  }
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={toggle} aria-expanded={open}
        className="tap glass inline-flex h-9 shrink-0 items-center rounded-full px-3.75 text-sm font-medium text-text-2 transition hover:text-text">
        الإعدادات
      </button>
      {open ? (
        <div role="status" className="absolute end-0 top-11 z-50 w-72 rounded-lg border border-border-2 bg-card p-3.5 text-sm leading-[1.7] text-text-2 shadow-pop">
          <p>التحضير بيوصلك كل يوم الساعة 8 بالليل: بتلاقي نقطة في الجرس فوق.</p>
          <p className="mt-2 text-text-3">{NOTE[state]}</p>
          {state === "default" ? (
            <button type="button" onClick={async () => setState(await askPermission())}
              className="tap bg-primary-fill mt-3 inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold transition hover:opacity-90">
              فعّل إشعارات المتصفح
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type Toast = { kind: "saved"; id: string } | { kind: "undone" } | { kind: "error"; msg: string };

export function BriefComposer({ date, dayWord, memo, whatsapp }: {
  /** the hearings day (yyyy-mm-dd): the reminder is for 07:00 of it */
  date: string;
  /** «بكرة» / «النهارده» / «يوم الأحد» */
  dayWord: string;
  /** the memo chip: null when there is no card */
  memo: { href: string; label: string; short: string } | null;
  /** the wa.me link with the summary (draft only), null when there is nothing to send */
  whatsapp: string | null;
}) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = (t: Toast | null, ms = 0) => {
    clearTimeout(timer.current);
    setToast(t);
    if (t && ms) timer.current = setTimeout(() => setToast(null), ms);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  function remind() {
    if (pending) return;
    start(async () => {
      const r = await setReminderAction(date);
      show(r.ok ? { kind: "saved", id: r.id } : { kind: "error", msg: r.error }, r.ok ? 10_000 : 5_000);
    });
  }
  function undo(id: string) {
    start(async () => {
      const r = await undoReminderAction(id);
      show(r.ok ? { kind: "undone" } : { kind: "error", msg: "تعذر إلغاء التذكير" }, 4_000);
    });
  }

  const chip = "tap glass inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-text-2 transition hover:text-text disabled:opacity-60";
  return (
    <>
      {toast ? (
        <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-44 z-40 flex justify-center px-3.5">
          <div className="glass pointer-events-auto flex items-center gap-3 rounded-full py-1.5 ps-4.5 pe-1.5 text-sm text-text">
            {toast.kind === "saved" ? (
              <>
                <span>هنذكّرك {dayWord} الساعة 7 الصبح</span>
                <button type="button" onClick={() => undo(toast.id)} disabled={pending}
                  className="tap inline-flex h-8 items-center rounded-full border border-border px-3.5 font-semibold text-text-2 transition hover:text-text disabled:opacity-50">تراجع</button>
              </>
            ) : toast.kind === "undone" ? <span className="pe-3">اتلغى</span> : <span className="pe-3 text-bad">{toast.msg}</span>}
          </div>
        </div>
      ) : null}
      {/* the three chips (they were above the composer; the chat panel is the composer now) */}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {memo ? <Link href={memo.href} className={chip}><FileText aria-hidden size={15} strokeWidth={1.9} /><span className="sm:hidden">{memo.short}</span><span className="hidden sm:inline">{memo.label}</span></Link> : null}
        {whatsapp ? <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={chip}><span className="sm:hidden">ابعته واتساب</span><span className="hidden sm:inline">ابعت الملخص ده واتساب</span></a> : null}
        {whatsapp ? <button type="button" onClick={remind} disabled={pending} className={`${chip} max-sm:hidden`}><Bell aria-hidden size={15} strokeWidth={1.9} />ذكّرني الصبح 7</button> : null}
      </div>
    </>
  );
}
