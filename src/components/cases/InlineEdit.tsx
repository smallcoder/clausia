"use client";
// A value with a small «تعديل» link that turns into one input + save / cancel. No big forms.
import { useActionState, useEffect, useState, type ReactNode } from "react";
import type { EditState } from "@/app/(app)/cases/actions";
import { Button } from "@/components/ui";

type Action = (prev: EditState, form: FormData) => Promise<EditState>;

export function InlineEdit({
  action, hidden, initial, display, placeholder, options, multiline, hint, label = "تعديل",
}: {
  action: Action;
  hidden: Record<string, string>;
  initial: string;
  display: ReactNode;
  placeholder?: string;
  options?: { value: string; label: string }[];
  multiline?: boolean;
  hint?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, null);
  useEffect(() => { if (state?.ok) setOpen(false); }, [state]);

  if (!open) {
    return (
      <span className="inline-flex flex-wrap items-baseline gap-x-2">
        <span>{display}</span>
        <button type="button" onClick={() => setOpen(true)} className="text-xs text-accent hover:underline">{label}</button>
      </span>
    );
  }
  const field = "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[15px] text-ink";
  return (
    <form action={formAction} className="mt-1 flex w-full flex-col gap-2">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {options ? (
        <select name="value" defaultValue={initial} className={field} autoFocus>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : multiline ? (
        <textarea name="value" defaultValue={initial} rows={3} className={field} placeholder={placeholder} autoFocus />
      ) : (
        <input name="value" defaultValue={initial} className={field} placeholder={placeholder} autoFocus />
      )}
      {hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
      {state?.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" disabled={pending}>{pending ? "جارٍ الحفظ…" : "حفظ"}</Button>
        <Button size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
      </div>
    </form>
  );
}
