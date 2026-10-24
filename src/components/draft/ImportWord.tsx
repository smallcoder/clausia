"use client";
/**
 * «افتح ملف Word كمسودة» (PR 7): one control in the case's «المذكرات والأحكام». Picking a .docx sends it at once (importWordAction): the server reads its
 * paragraphs, headings, bold and direction into a draft of this case, and the lawyer lands in the editor. The file is not kept; tables, pictures and
 * footnotes do not come across, and the editor says so.
 */
import { FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef } from "react";
import { cx } from "@/components/ui";
import { importWordAction } from "@/lib/draft/actions";

export function ImportWord({ caseId }: { caseId: string }) {
  const router = useRouter();
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(importWordAction, null);
  useEffect(() => { if (state?.ok && state.draftId) router.push(`/cases/${state.caseId}?tab=memos&draft=${state.draftId}`); }, [state, router]);
  return (
    <form ref={form} action={action} className="flex min-w-0 flex-col gap-1">
      <input type="hidden" name="caseId" value={caseId} />
      <input id={id} name="file" type="file" required accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" disabled={pending}
        onChange={(e) => { if (e.currentTarget.files?.length) form.current?.requestSubmit(); }} />
      <label htmlFor={id} className={cx("inline-flex h-11 w-fit cursor-pointer items-center gap-2 rounded-full border border-border-2 px-5 text-base font-semibold text-text-2 transition hover:text-text focus-within:ring-2 has-[:focus-visible]:ring-2", pending && "opacity-60")}>
        <FileUp aria-hidden size={16} strokeWidth={2} />{pending ? "بيتقرا الملف…" : "افتح ملف Word كمسودة"}
      </label>
      <p className="min-h-5 text-sm leading-5 text-text-3" aria-live="polite">
        {state?.error ? <span className="text-bad" role="alert">{state.error}</span> : "بنقرا الفقرات والعناوين والخط الغامق. الجداول والصور والهوامش السفلية مش بتتنقل."}
      </p>
    </form>
  );
}
