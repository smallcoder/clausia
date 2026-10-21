"use client";
// Upload control for the case Documents tab: one file → uploadDocumentAction (reads every page, posts a card in the case chat).
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { cx } from "@/components/ui";
import { uploadDocumentAction } from "@/lib/documents/actions";
import { ACCEPT, ALLOWED_MIME, MAX_BYTES } from "@/lib/documents/files";

export function UploadDocument({ caseId, threadId, compact = false }: { caseId?: string; threadId?: string; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [done, setDone] = useState<{ proposal: boolean } | null>(null);

  function onFile(f: File | undefined) {
    if (!f) return;
    setError(null); setWarning(null); setDone(null);
    if (!ALLOWED_MIME.includes(f.type)) return setError("نوع الملف غير مدعوم. ارفع PDF أو صورة (JPEG / PNG / WebP).");
    if (f.size > MAX_BYTES) return setError("حجم الملف أكبر من 25 ميجابايت.");
    setName(f.name);
    const fd = new FormData();
    fd.set("file", f);
    if (caseId) fd.set("caseId", caseId);
    if (threadId) fd.set("threadId", threadId);
    start(async () => {
      const r = await uploadDocumentAction(fd);
      if (!r.ok && r.warning) setWarning(`${r.error ?? "حُفظ النص لكن تعذر استخراج البيانات"}. يمكنك قراءة النص في تبويب المستندات.`);
      else if (!r.ok) setError(r.error ?? "تعذر رفع المستند");
      else setDone({ proposal: Boolean(r.proposalId) });
      if (input.current) input.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="flex max-w-88 flex-col gap-2">
      <input ref={input} type="file" accept={ACCEPT} className="sr-only" aria-label="اختر مستندًا" onChange={(e) => onFile(e.target.files?.[0])} disabled={pending} />
      <button type="button" onClick={() => input.current?.click()} disabled={pending}
        className={cx("inline-flex h-11 items-center justify-center gap-1.5 self-start rounded-full px-5 text-base font-bold transition disabled:opacity-60",
          compact ? "border border-border bg-chip text-text-2 shadow-soft hover:text-text" : "bg-primary-fill")}>
        {pending ? "بيقرا…" : "ارفع مستند"}
      </button>
      {pending && name ? (
        <p className="text-sm text-text-3" role="status">
          جارٍ رفع «{name}» وقراءة صفحاته. قد يستغرق ذلك دقيقة للمستندات الطويلة.
        </p>
      ) : null}
      {error ? <p className="text-sm text-bad" role="alert">{error}</p> : null}
      {warning && !pending ? <p className="text-sm text-gold" role="status">{warning}</p> : null}
      {done && !pending ? (
        <p className="text-sm text-good" role="status">
          {done.proposal ? "تمت القراءة. المقترحات بانتظار مراجعتك في محادثة الدعوى." : "تمت القراءة وحُفظ النص."}
        </p>
      ) : null}
    </div>
  );
}
