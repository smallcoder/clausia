"use client";
/**
 * «+ ارفع صيغة مكتبك»: a Word file with {{placeholders}} becomes one of the office's own templates (marked «مكتبك»). The file is KEPT: a draft made from it
 * is exported by putting the values INTO that file, so its formatting survives. The only fields are the ones a template needs (its name, its category);
 * nothing is saved until «ارفع الصيغة».
 */
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { uploadTemplateAction } from "@/app/(app)/library/actions";
import { cx } from "@/components/ui";
import { TEMPLATE_CATEGORY } from "@/lib/labels";

const field = "w-full rounded-md border border-border bg-field px-3.5 text-md text-text placeholder:text-text-4";

export function UploadTemplate() {
  const router = useRouter();
  const id = useId();
  const dlg = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState(uploadTemplateAction, null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<keyof typeof TEMPLATE_CATEGORY>("memo");
  useEffect(() => { if (state?.ok) router.refresh(); }, [state, router]);
  return (
    <>
      <button type="button" onClick={() => dlg.current?.showModal()} aria-haspopup="dialog" className="bg-primary-fill inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-5 text-base font-bold transition">
        <Plus aria-hidden size={16} strokeWidth={2.2} />ارفع صيغة مكتبك
      </button>
      <dialog ref={dlg} aria-labelledby={`${id}-t`} onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border-2 bg-card p-0 text-text shadow-pop backdrop:bg-backdrop" /* ds-allow: a dialog keeps a 16px margin on each side of a phone */>
        <form action={action} className="flex flex-col">
          <div className="border-b border-border-2 px-5 py-4">
            <h2 id={`${id}-t`} className="text-lg font-bold text-title">ارفع صيغة مكتبك</h2>
            <p className="mt-1 text-sm leading-6 text-text-3">
              ملف Word (.docx) بصيغتك. اكتب فيه مكان البيانات <bdi className="font-num">{"{{المحكمة}}"}</bdi> أو <bdi className="font-num">{"{{رقم الدعوى}}"}</bdi> أو <bdi className="font-num">{"{{الموكل}}"}</bdi>، وClausia تملاها من ملف القضية. الأسباب والطلبات: اكتب <bdi className="font-num">{"{{الأسباب}}"}</bdi> و<bdi className="font-num">{"{{الطلبات}}"}</bdi> في سطر لوحده، وهتفضل فاضية ليك.
            </p>
          </div>
          <div className="flex flex-col gap-3.5 px-5 py-4">
            <div>
              <label htmlFor={`${id}-f`} className="mb-1.5 block text-sm font-semibold text-text-3">ملف Word</label>
              <input id={`${id}-f`} name="file" type="file" required accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f && !name) setName(f.name.replace(/\.docx$/i, "")); }}
                className={cx(field, "min-h-11 py-2 text-base file:me-3 file:rounded-full file:border-0 file:bg-card-2 file:px-4 file:py-1.5 file:text-base file:font-semibold file:text-text-2")} />
            </div>
            <div>
              <label htmlFor={`${id}-n`} className="mb-1.5 block text-sm font-semibold text-text-3">اسم الصيغة</label>
              <input id={`${id}-n`} name="name" required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className={cx(field, "h-11")} />
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-semibold text-text-3">التصنيف</span>
              <input type="hidden" name="category" value={category} />
              <div role="radiogroup" aria-label="التصنيف" className="flex flex-wrap gap-1.5">
                {(Object.keys(TEMPLATE_CATEGORY) as (keyof typeof TEMPLATE_CATEGORY)[]).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={category === k} onClick={() => setCategory(k)}
                    className={cx("tap inline-flex h-9 items-center rounded-full px-3.5 text-base font-semibold transition", category === k ? "bg-selected text-on-selected shadow-card" : "border border-border-2 text-text-3 hover:text-text")}>{TEMPLATE_CATEGORY[k]}</button>
                ))}
              </div>
            </div>
          </div>
          <p className="mx-5 mb-3 min-h-5 text-sm leading-5" aria-live="polite">
            {state?.error ? <span className="rounded-md bg-bad-bg px-3 py-2 text-bad" role="alert">{state.error}</span> : state?.ok ? <span className="text-good">اترفعت الصيغة. {state.note}</span> : null}
          </p>
          <div className="flex gap-2 border-t border-border-2 px-5 py-4">
            <button disabled={pending || !!state?.ok} className="bg-primary-fill inline-flex h-11 items-center justify-center rounded-full px-6 text-md font-bold transition disabled:opacity-50">{pending ? "بيترفع…" : "ارفع الصيغة"}</button>
            <button type="button" onClick={() => dlg.current?.close()} className="inline-flex h-11 items-center rounded-full border border-border bg-chip px-5 text-md text-text-2">{state?.ok ? "تمام" : "إلغاء"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
