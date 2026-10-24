"use client";
/**
 * «ارفع ملف Word»: the one control of «ورق المكتب» (no settings form, no fields). Picking a file sends it at once (uploadOfficeStyleAction): the server reads the
 * header, the footer, the font and the margins from it, keeps the file, and the page refreshes with what it took. Used for the first time (the prompt on a draft)
 * and to replace the file later («ورق المكتب» in the account menu).
 */
import { FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef } from "react";
import { uploadOfficeStyleAction } from "@/app/(app)/settings/office-style/actions";
import { cx } from "@/components/ui";

export function OfficeStyleUpload({ label = "ارفع ملف Word", primary = true }: { label?: string; primary?: boolean }) {
  const router = useRouter();
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(uploadOfficeStyleAction, null);
  useEffect(() => { if (state?.ok) router.refresh(); }, [state, router]);
  return (
    <form ref={form} action={action} className="flex min-w-0 flex-col gap-2">
      <input id={id} name="file" type="file" required accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" disabled={pending}
        onChange={(e) => { if (e.currentTarget.files?.length) form.current?.requestSubmit(); }} />
      <label htmlFor={id} className={cx("inline-flex h-11 w-fit cursor-pointer items-center gap-2 rounded-full px-5 text-base font-bold transition focus-within:ring-2 has-[:focus-visible]:ring-2", primary ? "bg-primary-fill" : "border border-border-2 glass-icon hover:text-text", pending && "opacity-60")}>
        <FileUp aria-hidden size={16} strokeWidth={2} />{pending ? "بيتقرا الملف…" : label}
      </label>
      <p className="min-h-5 text-sm leading-5" aria-live="polite">
        {state?.error ? <span className="text-bad" role="alert">{state.error}</span> : state?.ok ? <span className="text-good">اتحفظ ورق المكتب. {state.note}</span> : null}
      </p>
    </form>
  );
}
