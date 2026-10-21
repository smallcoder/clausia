"use client";
// A value with a small «تعديل» link that turns into one input + save / cancel. No big forms.
// `startOpen`: the field is shown at once (a row that already expanded to edit); cancel / save then close
// the surrounding <details>.
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import type { EditState } from "@/app/(app)/cases/actions";

type Action = (prev: EditState, form: FormData) => Promise<EditState>;

const field = "w-full rounded-2xl border border-border bg-field px-3.5 text-md text-text placeholder:text-text-4 focus:border-gold focus:outline-none";

export function InlineEdit({
  action, hidden, initial, display, placeholder, options, multiline, hint, label = "تعديل", startOpen = false,
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
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [state, formAction, pending] = useActionState(action, null);
  const form = useRef<HTMLFormElement>(null);
  const close = () => {
    const d = form.current?.closest("details");
    if (startOpen && d) d.open = false;
    else setOpen(false);
  };
  useEffect(() => {
    if (!state?.ok) return;
    const d = form.current?.closest("details");
    if (startOpen && d) d.open = false;
    else setOpen(false);
  }, [state, startOpen]);

  if (!open) {
    return (
      <span className="inline-flex flex-wrap items-baseline gap-x-2">
        <span>{display}</span>
        <button type="button" onClick={() => setOpen(true)} className="-my-2 inline-flex min-h-11 items-center px-2 text-sm font-semibold text-text-2 hover:text-text hover:underline">{label}</button>
      </span>
    );
  }
  return (
    <form ref={form} action={formAction} className="flex w-full flex-col gap-2.5">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {options ? (
        <select name="value" defaultValue={initial} className={`${field} h-11`} autoFocus={!startOpen}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : multiline ? (
        <textarea name="value" defaultValue={initial} rows={3} className={`${field} py-2.5`} placeholder={placeholder} autoFocus={!startOpen} />
      ) : (
        <input name="value" defaultValue={initial} className={`${field} h-11`} placeholder={placeholder} autoFocus={!startOpen} autoComplete="off" />
      )}
      {hint ? <p className="text-sm leading-5 text-text-3">{hint}</p> : null}
      {state?.error ? <p className="rounded-xl bg-bad-bg px-3 py-2 text-base text-bad" role="alert">{state.error}</p> : null}
      <div className="flex gap-2">
        <button disabled={pending} className="bg-primary-fill inline-flex h-11 items-center justify-center rounded-full px-6 text-md font-bold transition disabled:opacity-60">{pending ? "بيتحفظ…" : "حفظ"}</button>
        <button type="button" onClick={close} className="inline-flex h-11 items-center rounded-full border border-border bg-chip px-5 text-md text-text-2">إلغاء</button>
      </div>
    </form>
  );
}
