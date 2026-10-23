/**
 * A draft, read only (PR 6; the editor is PR 7): the paper as the lawyer will print it, then what the code filled and from where.
 *  - a value the case file did not have is a gold blank with its name, never a guess;
 *  - the legal grounds and the requests are sections only the lawyer writes: empty (dashed) unless he asked Clausia to draft them, and then they carry
 *    «محتاجة تأكيدك»;
 *  - the sources are NOT inside the text (the Word file has no marks either): they are listed under the paper.
 * «تنزيل Word» is a link to the export when `downloadHref` is given, else it says «قريباً».
 */
import { ChevronRight, Download } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { DateText } from "@/components/ui";
import { PLACEHOLDER, needsFromLawyer } from "@/lib/library/fill";
import type { DraftFull } from "@/lib/library/list";

/** a text with its blanks: «{{court}}» that the file could not fill becomes a gold blank with the name of the missing value */
function WithBlanks({ text, labels }: { text: string; labels: Map<string, string> }) {
  const parts = text.split(new RegExp(PLACEHOLDER.source, "g"));
  return (
    <>
      {parts.map((s, i) => i % 2 === 0 ? <Fragment key={i}>{s}</Fragment> : (
        <span key={i} className="mx-0.5 inline-block min-w-20 rounded-sm border-b border-dashed border-gold-edge bg-gold-bg px-1.5 text-center text-sm text-gold-text-small">{labels.get(s) ?? "……"}</span>
      ))}
    </>
  );
}

export function DraftView({ draft, backHref, downloadHref }: { draft: DraftFull; backHref: string; downloadHref?: string }) {
  const labels = new Map(draft.fill.missing.map((m) => [m.key, m.label]));
  const need = needsFromLawyer(draft.fill);
  const toConfirm = draft.fill.lawyer.filter((l) => l.state === "needs_confirmation");
  return (
    <div className="space-y-4 pb-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link href={backHref} className="tap inline-flex min-h-11 items-center gap-1 text-base font-semibold text-text-2 hover:text-text"><ChevronRight aria-hidden size={18} strokeWidth={2} />المذكرات والأحكام</Link>
        <span className="ms-auto flex flex-wrap items-center gap-2">
          {downloadHref ? (
            <a href={downloadHref} className="bg-primary-fill inline-flex h-11 items-center gap-2 rounded-full px-5 text-base font-bold transition"><Download aria-hidden size={16} strokeWidth={2} />تنزيل Word</a>
          ) : (
            <span aria-disabled className="inline-flex h-11 items-center gap-2 rounded-full border border-border-2 px-5 text-base font-medium text-text-4"><Download aria-hidden size={16} strokeWidth={2} />تنزيل Word · قريباً</span>
          )}
        </span>
      </div>

      <section className="rounded-xl border border-border-2 bg-card shadow-card" aria-label={draft.title}>
        <header className="border-b border-border-2 px-5 py-4 sm:px-8">
          <h2 className="text-lg font-bold text-title">{draft.title}</h2>
          <p className="mt-1 text-sm text-text-3">
            مسودة من صيغة «{draft.template_name}» · <DateText iso={draft.created_at.slice(0, 10)} />
            {draft.needs_lawyer_review ? " · الصيغة لسه محتاجة مراجعة محامٍ" : ""}
          </p>
        </header>
        <article className="text-doc space-y-3 px-5 py-6 text-md leading-8 text-text sm:px-10 sm:py-8">
          {draft.body.blocks.map((b, i) => {
            if (b.t !== "lawyer") {
              const t = <WithBlanks text={b.text} labels={labels} />;
              return b.t === "title" ? <h3 key={i} className="pb-2 text-center text-lg font-bold text-title">{t}</h3>
                : b.t === "h" ? <h4 key={i} className="pt-3 text-md font-bold text-title">{t}</h4>
                : <p key={i} className="whitespace-pre-line">{t}</p>;
            }
            return (
              <div key={i} className="pt-3">
                <h4 className="flex flex-wrap items-center gap-2 text-md font-bold text-title">
                  {b.heading}
                  {b.state === "needs_confirmation" ? <span className="rounded-full bg-gold-bg px-2.5 py-0.5 text-xs font-semibold text-gold-text-small">محتاجة تأكيدك</span> : null}
                </h4>
                {b.text ? <p className="mt-1 whitespace-pre-line">{b.text}</p> : (
                  <p className="mt-1.5 rounded-md border border-dashed border-border-strong px-4 py-4 text-base text-text-3">{b.hint ?? "بيكتبها المحامي"}: لسه فاضية</p>
                )}
              </div>
            );
          })}
        </article>
      </section>

      <section className="rounded-xl border border-border-2 bg-card px-5 py-4 shadow-card sm:px-8" aria-label="اللي اتملا ومصدره">
        <h2 className="text-md font-bold text-title">اللي اتملا من الملف ومصدره</h2>
        {draft.fill.filled.length ? (
          <ul className="mt-2 divide-y divide-border-2">
            {draft.fill.filled.map((f) => (
              <li key={f.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-base">
                <span className="w-32 shrink-0 text-text-3">{f.label}</span>
                <bdi className="min-w-0 flex-1 basis-60 whitespace-pre-line font-semibold text-text">{f.value}</bdi>
                <span className="text-sm text-text-3">{f.source}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-base text-text-3">مفيش بيانات اتملت من الملف.</p>}
        {need.length ? <p className="mt-3 text-base font-semibold text-gold">محتاجة منك: {need.join("، ")}</p> : null}
        {toConfirm.length ? <p className="mt-1 text-base font-semibold text-gold">محتاجة تأكيدك (مكتوبة بناءً على طلبك): {toConfirm.map((l) => l.heading).join("، ")}</p> : null}
        {draft.fill.missing.length ? (
          <ul className="mt-2 space-y-0.5 text-sm text-text-3">{draft.fill.missing.map((m) => <li key={m.key}>{m.label}: {m.reason}</li>)}</ul>
        ) : null}
      </section>
    </div>
  );
}
