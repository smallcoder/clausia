"use client";
// «+ عمود جديد» (the documents table): the lawyer types ONE question; Clausia asks it of every paper of the case and posts
// ONE confirmation card under the title (nothing is saved before the tap). The question box opens under the button.
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cx } from "@/components/ui";
import { askColumnAction } from "@/lib/doc-columns/actions";

export function AddColumn({ caseId, disabled = false }: { caseId: string; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  // Esc closes the box (not while Clausia is reading: the answer still comes)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !pending) setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, pending]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || pending) return;
    setError(null); setWarning(null);
    start(async () => {
      const r = await askColumnAction(caseId, q);
      if (!r.ok) { setError(r.error ?? "تعذّر تجهيز العمود"); return; }
      setQuestion("");
      if (r.failed) setWarning(`جهّزت البطاقة، بس ${r.failed === 1 ? "مستند واحد" : r.failed === 2 ? "مستندين" : `${r.failed} مستندات`} ما اتسألوش (حصلت مشكلة). جرّب السؤال تاني بعد ما تأكد.`);
      else setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} disabled={disabled} aria-expanded={open} aria-haspopup="dialog"
        className="tap inline-flex h-chip items-center justify-center gap-1.5 rounded-full border border-border bg-chip px-4.5 text-sm font-bold text-text-2 shadow-soft transition hover:text-text disabled:opacity-60">
        <Plus aria-hidden size={14} strokeWidth={2.2} />عمود جديد
      </button>
      {open ? (
        <form onSubmit={submit} role="dialog" aria-label="عمود جديد"
          className="absolute end-0 top-full z-20 mt-3 w-88 max-w-[calc(100vw-2rem)] space-y-3 rounded-md border border-border-2 bg-card px-4 py-4 shadow-pop" /* ds-allow: a share of the screen width (vw), not a length: the box never passes the page gutter */>
          <label htmlFor="doc-column-q" className="block text-base font-semibold text-text">اسأل سؤال على كل مستندات القضية</label>
          <input id="doc-column-q" ref={input} value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} disabled={pending}
            placeholder="مثلاً: فيه شرط جزائي؟"
            className="min-h-11 w-full rounded-md border border-border bg-field px-3 py-2 text-md text-text disabled:opacity-60" />
          <p className="text-sm leading-5 text-text-3">
            Clausia بيسأله لكل مستند لوحده، ويطلّع إجابة قصيرة مع الصفحة والجملة. هتشوف النتيجة في بطاقة، ومفيش حاجة هتتحفظ قبل ما تأكد.
          </p>
          {pending ? <p className="text-sm text-text-3" role="status">بقرا المستندات… قد يستغرق ذلك نصف دقيقة.</p> : null}
          {error ? <p className="text-sm text-bad" role="alert">{error}</p> : null}
          {warning && !pending ? <p className="text-sm text-gold" role="status">{warning}</p> : null}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={pending || question.trim().length < 3}
              className={cx("bg-primary-fill inline-flex h-11 items-center rounded-full px-5 text-base font-bold transition disabled:opacity-50")}>
              {pending ? "بسأل…" : "اسأل"}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={pending}
              className="inline-flex min-h-11 items-center rounded-full px-3 text-base text-text-3 transition hover:text-text disabled:opacity-50">إلغاء</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
