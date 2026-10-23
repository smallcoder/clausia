/**
 * A client's three tabs (`?tab=`): «القضايا» (a table: case, role, next hearing, status; a finished case is faded), «الحسابات» (the money: src/components/accounts)
 * and «الأوراق» (the papers saved on the client, shared by all their cases). The tab is the address, so it can be linked and back works.
 */
import { FileText } from "lucide-react";
import Link from "next/link";
import { dateLabel } from "@/components/caselist/CaseListRow";
import { DateText, cx } from "@/components/ui";
import { FINISHED, type ClientCase, type ClientDoc } from "@/lib/clients";
import { formatDmy } from "@/lib/dates";
import { CASE_STATUS, DOC_TYPE, PARTY_ROLE } from "@/lib/labels";

export const CLIENT_TABS = [
  { key: "cases", label: "القضايا" },
  { key: "accounts", label: "الحسابات" },
  { key: "documents", label: "الأوراق" },
] as const;
export type ClientTabKey = (typeof CLIENT_TABS)[number]["key"];

/** The tab a `?tab=` value means; anything unknown (or none) is the cases tab. */
export function resolveClientTab(tab: string | undefined): ClientTabKey {
  return CLIENT_TABS.find((t) => t.key === tab)?.key ?? "cases";
}

export function clientTabHref(id: string, tab: ClientTabKey, keep: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams();
  for (const k of ["s", "q", "sheet"]) if (keep[k]) q.set(k, keep[k]!);
  q.set("tab", tab); // always spelled out: on a phone a client address with no tab is the chat, with a tab it is the open sheet
  return `/clients/${id}?${q}`;
}

export function ClientTabBar({ id, active, counts, keep }: { id: string; active: ClientTabKey; counts: Partial<Record<ClientTabKey, number>>; keep: Record<string, string | undefined> }) {
  return (
    <nav aria-label="أقسام الموكل" className="no-scrollbar mt-5 flex gap-1 overflow-x-auto border-b border-border-2">
      {CLIENT_TABS.map((t) => {
        const is = t.key === active;
        const n = counts[t.key];
        return (
          <Link key={t.key} href={clientTabHref(id, t.key, keep)} scroll={false} aria-current={is ? "page" : undefined}
            className={`tap -mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-base transition-colors sm:px-4 sm:text-md ${is ? "border-title font-bold text-title" : "border-transparent font-medium text-text-3 hover:text-text"}`}>
            {t.label}
            {n !== undefined ? <span className="font-num text-sm text-text-3">{n}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** md+ columns, shared by the head and the rows: case, role, next hearing, status */
const COLS = "md:grid md:grid-cols-[minmax(0,1fr)_110px_150px_150px] md:gap-6";

/** «إخلاء لعدم سداد الأجرة»: the subject is the part of the title before « — » (the rest names the parties), else the type */
const subject = (c: ClientCase) => (c.title?.split(" — ")[0] || c.case_type || "").trim() || "دعوى بلا عنوان";

export function CasesTable({ cases, today }: { cases: ClientCase[]; today: string }) {
  if (!cases.length) {
    return (
      <section className="rounded-xl border border-border-2 bg-card px-6 py-12 text-center shadow-card">
        <h2 className="text-lg font-bold text-title">لسه مفيش قضايا للموكل ده</h2>
        <p className="mx-auto mt-1.5 max-w-md text-base leading-7 text-text-3">دوس «قضية جديدة له» وقول لـ Clausia على الدعوى، وهي تجهّز الملف وتستنى تأكيدك.</p>
      </section>
    );
  }
  return (
    <section aria-label="قضايا الموكل" className="overflow-hidden rounded-xl border border-border-2 bg-card px-4.5 shadow-card md:px-0">
      <div className={`hidden px-7.5 pb-3 pt-4 text-sm leading-4 font-medium text-text-4 ${COLS}`}>
        <span>القضية</span><span>الصفة</span><span>الجلسة الجاية</span><span>الحالة</span>
      </div>
      <ul>
        {cases.map((c) => {
          const done = FINISHED.includes(c.status);
          const next = c.next_hearing ? dateLabel(c.next_hearing, today) : null;
          const where = [c.court, c.circuit].filter(Boolean).join(" · ");
          const num = [c.case_number ? (c.case_year ? `${c.case_number} لسنة ${c.case_year}` : c.case_number) : null, where].filter(Boolean).join(" · ");
          const role = c.client_role ? PARTY_ROLE[c.client_role] : null;
          const nextText = next ? <DateText value={next.text} /> : <span aria-label="لا جلسة جاية">—</span>;
          const nextCls = next?.today ? "font-bold text-text" : "font-medium text-text-3";
          const status = (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-3">
              <span aria-hidden className={cx("size-1.5 rounded-full", c.status === "active" ? "bg-good" : "bg-text-4")} />{CASE_STATUS[c.status]}
            </span>
          );
          return (
            <li key={c.id} className="border-t border-border-2 first:border-t-0 md:first:border-t">
              {/* a finished case is faded: its title steps down to the muted text colour and loses its weight (no opacity: the muted colours keep 4.5:1) */}
              <Link href={`/cases/${c.id}`} className={cx("flex min-h-11 items-center gap-3 py-3.25 transition-colors md:px-7.5 md:py-3.75 md:hover:bg-card-2", COLS)}>
                <span className="min-w-0 flex-1">
                  <span className={cx("block truncate text-base leading-[19px] md:text-md md:leading-[21px]", done ? "font-medium text-text-3" : "font-semibold text-text")}>{subject(c)}</span>
                  <span className="mt-0.75 block truncate text-xs leading-4 text-text-4 md:text-sm"><DateText value={num || "بلا رقم"} /></span>
                </span>
                <span className="hidden text-base text-text-3 md:block">{role ?? <span className="text-text-4">—</span>}</span>
                <span className={`hidden text-base md:block ${nextCls}`}>{nextText}</span>
                <span className="hidden md:block">{status}</span>
                {/* phone: the next hearing, the status under it */}
                <span className="flex shrink-0 flex-col items-end text-left md:hidden">
                  <span className={`text-sm leading-4 ${nextCls}`}>{nextText}</span>
                  <span className="mt-0.75">{status}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** «الأوراق»: the client's own papers (a power of attorney, the fees contract, an ID); one list for all their cases */
export function ClientDocs({ docs }: { docs: ClientDoc[] }) {
  return (
    <section aria-label="أوراق الموكل" className="rounded-xl border border-border-2 bg-card shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-border-2 px-6 py-4">
        <h2 className="text-lg font-bold text-title">أوراق الموكل</h2>
      </div>
      {docs.length ? (
        <ul className="px-6">
          {docs.map((d) => {
            const meta = [DOC_TYPE[d.doc_type], d.doc_date ? formatDmy(d.doc_date) : null, d.page_count ? `${d.page_count} ص` : null].filter(Boolean).join(" · ");
            return (
              <li key={d.id} className="border-t border-border-2 first:border-t-0">
                <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" className="tap flex min-h-14 items-center gap-3.5 py-3 hover:opacity-80">
                  <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border-2 bg-card-2 text-text-3"><FileText size={17} strokeWidth={1.8} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-md font-semibold text-text">{d.title || DOC_TYPE[d.doc_type] || d.file_name}</span>
                    <span className="mt-0.5 block truncate text-sm text-text-4"><DateText value={meta} /></span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-6 py-8 text-base leading-7 text-text-3">لسه مفيش أوراق متسجلة للموكل ده (توكيل، عقد أتعاب، إثبات شخصية).</p>
      )}
      <p className="border-t border-border-2 px-6 py-3.5 text-sm text-text-4">الأوراق دي بتتشاف في كل قضاياه.</p>
    </section>
  );
}
