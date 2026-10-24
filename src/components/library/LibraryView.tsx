"use client";
/**
 * «المكتبة» (docs/design/ia/IALibrary*): the title and the search, two tabs («الصيغ» and «التشريعات والأحكام», which says «قريباً» until the LawMill link
 * exists), a chip per category with its count (and «صيغ المكتب»), and one card per template: the name, its category, a short line, how many times THIS
 * office used it, and «استخدمها في قضية». The templates are data from the database (the shared base ones and the office's own); the search and the chips
 * only filter that list in the browser. «استخدمها في قضية» asks which case, then opens that case with the sentence in the chat box (`?q=`): nothing is
 * sent and nothing is saved by it.
 */
import { ChevronLeft, FileText, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState } from "react";
import { UploadTemplate } from "@/components/library/UploadTemplate";
import { cx } from "@/components/ui";
import { OFFICE_TEMPLATES_LABEL, TEMPLATE_CATEGORY } from "@/lib/labels";
import type { TemplateRow } from "@/lib/library/list";
import { normalizeForMatch } from "@/lib/quote-match";

export interface PickCase { id: string; /** the client's name (or null) */ who: string | null; /** «إخلاء لعدم سداد الأجرة · 772 لسنة 2025» */ about: string }

type Filter = "all" | "office" | keyof typeof TEMPLATE_CATEGORY;
const CATEGORIES = Object.keys(TEMPLATE_CATEGORY) as (keyof typeof TEMPLATE_CATEGORY)[];

/** «12 مرة», «مرة واحدة», «مرتين» */
const timesWord = (n: number) => (n === 0 ? "لسه ما اتستخدمتش" : n === 1 ? "استُخدمت مرة" : n === 2 ? "استُخدمت مرتين" : `استُخدمت ${n} ${n <= 10 ? "مرات" : "مرة"}`);

function Capsule({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className="tap group inline-flex shrink-0 items-center">
      <span className={cx("inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3.25 text-sm transition sm:h-chip sm:px-3.75", on ? "pill-on" : "font-medium glass-icon group-hover:text-text")}>{children}</span>
    </button>
  );
}

export function LibraryView({ templates, cases }: { templates: TemplateRow[]; cases: PickCase[] }) {
  const [tab, setTab] = useState<"templates" | "laws">("templates");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [using, setUsing] = useState<TemplateRow | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: templates.length, office: templates.filter((t) => t.office).length };
    for (const k of CATEGORIES) c[k] = templates.filter((t) => t.category === k).length;
    return c;
  }, [templates]);
  const shown = useMemo(() => {
    const needle = normalizeForMatch(q);
    return templates.filter((t) => (filter === "all" ? true : filter === "office" ? t.office : t.category === filter)
      && (!needle || normalizeForMatch(`${t.name} ${t.description} ${TEMPLATE_CATEGORY[t.category]}`).includes(needle)));
  }, [templates, filter, q]);
  const hasBase = templates.some((t) => !t.office && t.needs_lawyer_review);

  const tabCls = (on: boolean) => cx("tap -mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-md transition-colors sm:px-4", on ? "border-title font-bold text-title" : "border-transparent font-medium text-text-3 hover:text-text");

  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col px-4 sm:px-10">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-3 sm:pt-13">
        <h1 className="text-xl font-bold leading-[1.1] text-title sm:text-page-title">المكتبة</h1>
        {tab === "templates" ? (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-3 sm:ms-auto sm:w-auto sm:flex-nowrap">
            <UploadTemplate />
            <label className="focus-host flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-border-2 bg-field px-4 text-text-3 sm:w-80 sm:flex-none">
              <Search aria-hidden size={16} strokeWidth={1.8} className="shrink-0" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر في الصيغ…" aria-label="دوّر في الصيغ"
                className="bare-field min-w-0 flex-1 bg-transparent text-base text-text placeholder:text-text-3" />
            </label>
          </div>
        ) : null}
      </header>

      <div role="tablist" aria-label="أقسام المكتبة" className="mt-5 flex gap-1 overflow-x-auto border-b border-border-2 no-scrollbar">
        <button type="button" role="tab" aria-selected={tab === "templates"} onClick={() => setTab("templates")} className={tabCls(tab === "templates")}>الصيغ</button>
        <button type="button" role="tab" aria-selected={tab === "laws"} onClick={() => setTab("laws")} className={tabCls(tab === "laws")}>
          التشريعات والأحكام <span className="rounded-full bg-card-2 px-2 py-0.5 text-xs font-medium text-text-3">قريباً</span>
        </button>
      </div>

      {tab === "laws" ? (
        <section className="mt-6 rounded-xl border border-border-2 bg-card px-6 py-12 text-center shadow-card" role="tabpanel">
          <h2 className="text-lg font-bold text-title">التشريعات والأحكام قريباً</h2>
          <p className="mx-auto mt-1.5 max-w-md text-base leading-7 text-text-3">هتدوّر هنا في القوانين وأحكام النقض لما نربط Clausia بمكتبة التشريعات.</p>
        </section>
      ) : (
        <div role="tabpanel">
          <nav aria-label="تصنيفات الصيغ" className="no-scrollbar mt-4 flex items-center gap-0.5 overflow-x-auto py-1.5 sm:gap-1">
            <Capsule on={filter === "all"} onClick={() => setFilter("all")}>كل الصيغ <span className="font-num">{counts.all}</span></Capsule>
            {CATEGORIES.map((k) => <Capsule key={k} on={filter === k} onClick={() => setFilter(k)}>{TEMPLATE_CATEGORY[k]} <span className="font-num">{counts[k]}</span></Capsule>)}
            <Capsule on={filter === "office"} onClick={() => setFilter("office")}>{OFFICE_TEMPLATES_LABEL} <span className="font-num">{counts.office}</span></Capsule>
          </nav>

          {shown.length ? (
            <ul className="mt-3 grid gap-3.5 pb-6 sm:grid-cols-2 xl:grid-cols-3" aria-label="الصيغ">
              {shown.map((t) => (
                <li key={t.id} className="flex min-w-0 flex-col rounded-lg border border-border-2 bg-card p-4.5 shadow-card">
                  <div className="flex items-start gap-3">
                    <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-card-2 text-text-3"><FileText size={18} strokeWidth={1.8} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-4 text-text-3">
                        {t.office ? <><span className="font-semibold text-gold">مكتبك</span> · </> : null}{TEMPLATE_CATEGORY[t.category]}
                      </p>
                      <h2 className="mt-0.5 text-md font-bold leading-[1.4] text-title">{t.name}</h2>
                    </div>
                  </div>
                  <p className="mt-3 flex-1 text-sm leading-6 text-text-3">{t.description}</p>
                  <div className="mt-3.5 flex items-center justify-between gap-3">
                    <span className="text-xs text-text-4">{timesWord(t.uses)}</span>
                    <button type="button" onClick={() => setUsing(t)} aria-haspopup="dialog" aria-label={`استخدم ${t.name} في قضية`}
                      className="tap inline-flex items-center gap-0.5 text-sm font-bold text-title hover:underline">استخدمها في قضية<ChevronLeft aria-hidden size={15} strokeWidth={2} /></button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <section className="mt-3 rounded-xl border border-border-2 bg-card px-6 py-10 text-center shadow-card">
              <h2 className="text-md font-bold text-title">{q ? "مفيش صيغة بالاسم ده" : filter === "office" ? "لسه مفيش صيغ للمكتب" : "مفيش صيغ هنا"}</h2>
              <p className="mx-auto mt-1.5 max-w-md text-base leading-7 text-text-3">{q ? "جرّب كلمة تانية، أو شيل التصنيف." : "الصيغ بتظهر هنا لما تتضاف."}</p>
            </section>
          )}
          {hasBase ? <p className="pb-6 text-sm leading-6 text-text-3">الصيغ الأساسية هياكل بسيطة: الأسباب والطلبات فيها فاضية للمحامي، ولسه بتتراجع من محامٍ قبل ما تعتمد عليها.</p> : null}
        </div>
      )}

      {using ? <UseInCase template={using} cases={cases} onClose={() => setUsing(null)} /> : null}
    </div>
  );
}

/** «استخدمها في قضية»: which case? A dialog with a search and the cases; a tap opens the case with the sentence in the chat box. */
function UseInCase({ template, cases, onClose }: { template: TemplateRow; cases: PickCase[]; onClose: () => void }) {
  const router = useRouter();
  const id = useId();
  const dlg = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const needle = normalizeForMatch(q);
  const list = needle ? cases.filter((c) => normalizeForMatch(`${c.who ?? ""} ${c.about}`).includes(needle)) : cases;
  // the dialog opens when it mounts
  const ref = (el: HTMLDialogElement | null) => { dlg.current = el; if (el && !el.open) el.showModal(); };
  const pick = (c: PickCase) => {
    const sentence = `${template.name} لقضية ${c.who ?? c.about}`.slice(0, 300);
    router.push(`/cases/${c.id}?q=${encodeURIComponent(sentence)}`);
    onClose();
  };
  return (
    <dialog ref={ref} aria-labelledby={`${id}-t`} onClose={onClose} onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border border-border-2 bg-card p-0 text-text shadow-pop backdrop:bg-backdrop" /* ds-allow: a dialog keeps a 16px margin on each side of a phone */>
      <div className="border-b border-border-2 px-5 py-4">
        <h2 id={`${id}-t`} className="text-lg font-bold text-title">{template.name}: لأنهي قضية؟</h2>
        <p className="mt-1 text-sm leading-6 text-text-3">هتفتح القضية والجملة جاهزة في الشات. مش هيتبعت ولا هيتحفظ حاجة قبل ما تأكد.</p>
      </div>
      <div className="px-5 pt-3">
        <label className="focus-host flex h-11 items-center gap-2 rounded-full border border-border-2 bg-field px-4 text-text-3">
          <Search aria-hidden size={16} strokeWidth={1.8} className="shrink-0" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم الموكل أو رقم القضية" aria-label="دوّر في القضايا" autoFocus
            className="bare-field min-w-0 flex-1 bg-transparent text-base text-text placeholder:text-text-3" />
        </label>
      </div>
      <ul className="max-h-96 overflow-y-auto px-2 py-2">
        {list.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => pick(c)} className="flex min-h-12 w-full flex-col items-start rounded-md px-3 py-2 text-start transition-colors hover:bg-card-2">
              <span className="text-base font-semibold text-text">{c.who ?? c.about}</span>
              {c.who ? <span className="text-sm text-text-3">{c.about}</span> : null}
            </button>
          </li>
        ))}
        {!list.length ? <li className="px-3 py-6 text-center text-base text-text-3">{cases.length ? "مفيش قضية بالاسم ده" : "لسه مفيش قضايا. ابدأ قضية من الشات الأول."}</li> : null}
      </ul>
      <div className="flex justify-end border-t border-border-2 px-5 py-3.5">
        <button type="button" onClick={() => dlg.current?.close()} className="inline-flex h-11 items-center rounded-full border border-border bg-chip px-5 text-md text-text-2">إلغاء</button>
      </div>
    </dialog>
  );
}
