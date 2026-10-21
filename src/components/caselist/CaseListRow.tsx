/**
 * One case in the cases list (docs/design/*Cases.dc.html). Desktop (md+): a 4-column grid row under
 * CaseListHeader — case («client — subject» + number), court · circuit, next hearing, marker.
 * Mobile: title + «number · court · circuit», then the date with the marker under it. No avatars.
 * The marker column is empty for a plain active case; otherwise one dot + word (Tag, sized as the mockup draws it).
 * Line heights are the px the mockup's `line-height: normal` renders (body is 1.6): rows are 71px desktop, 65px mobile.
 */
import Link from "next/link";
import type { CaseRow } from "@/lib/cases";
import { addDaysIso } from "@/lib/dates";
import { CASE_STATUS } from "@/lib/labels";

/** md+ column template, shared by the header and every row so they line up. */
export const COLS = "md:grid md:grid-cols-[minmax(0,2.3fr)_minmax(0,1.9fr)_minmax(0,0.7fr)_minmax(0,0.9fr)] md:gap-6";

/** «client — subject». DB titles read «subject — client ضد opponent», so the subject is the part before « — ». */
export function caseTitle(r: CaseRow): string {
  const subject = (r.title?.split(" — ")[0] || r.case_type || "").trim();
  if (r.client?.name) return subject ? `${r.client.name} — ${subject}` : r.client.name;
  return r.title || subject || "دعوى بلا عنوان";
}

/** «772 لسنة 2025» */
function caseNumber(r: CaseRow): string {
  if (!r.case_number) return "بلا رقم";
  return r.case_year ? `${r.case_number} لسنة ${r.case_year}` : r.case_number;
}

/** today «النهارده», tomorrow «بكرة», else d/m/yyyy (CLAUDE.md: dates always d/m/yyyy). */
function dateLabel(iso: string, today: string): { text: string; today: boolean; word: boolean } {
  if (iso === today) return { text: "النهارده", today: true, word: true };
  if (iso === addDaysIso(today, 1)) return { text: "بكرة", today: false, word: true };
  const [y, m, d] = iso.split("-").map(Number);
  return { text: `${d}/${m}/${y}`, today: false, word: false };
}

export interface RowFlags { decision: boolean; review: boolean; againstUs: boolean }

/** dot + word: desktop 12.5px, 7px gap, 6px dot; mobile 10.5px, 4px gap, 5px dot (docs/design/*Cases.dc.html) */
function Tag({ tone, children }: { tone: "warn" | "neutral" | "bad"; children: React.ReactNode }) {
  const [dot, text] = { warn: ["bg-gold", "text-gold"], neutral: ["bg-text-3", "text-text-3"], bad: ["bg-bad", "text-bad"] }[tone];
  return (
    <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold leading-[15px] md:gap-[7px] md:text-[12.5px] md:leading-[17px] ${text}`}>
      <span aria-hidden className={`size-[5px] shrink-0 rounded-full md:size-1.5 ${dot}`} />{children}
    </span>
  );
}

/** One marker at most: needs decision → a non-active status → needs review → nothing. */
function Marker({ r, f }: { r: CaseRow; f: RowFlags }) {
  if (f.decision) return <Tag tone="warn">محتاجة قرار</Tag>;
  if (r.status !== "active") {
    if (f.againstUs && (r.status === "judged" || r.status === "closed")) return <Tag tone="bad">حكم ضدنا</Tag>;
    return <Tag tone="neutral">{CASE_STATUS[r.status]}</Tag>;
  }
  if (f.review) return <Tag tone="warn">محتاجة مراجعة</Tag>;
  return null;
}

export function CaseListRow({ r, today, flags }: { r: CaseRow; today: string; flags: RowFlags }) {
  const title = caseTitle(r);
  const where = [r.court, r.circuit].filter(Boolean).join(" · ");
  const next = r.next_hearing ? dateLabel(r.next_hearing, today) : null;
  const nextCls = next?.today ? "font-bold text-text" : flags.decision && !next ? "font-medium text-gold" : "font-medium text-text-3";
  const nextText = next ? <span className={next.word ? "" : "num"}>{next.text}</span> : <span aria-label="لا جلسة جاية">—</span>;
  const marker = <Marker r={r} f={flags} />;
  return (
    <li className="border-t border-border-2 first:border-t-0 md:first:border-t">
      <Link href={`/cases/${r.id}`}
        className={`flex min-h-11 items-center gap-3 py-[13px] transition-colors md:px-[30px] md:py-[15px] md:hover:bg-card-2 ${COLS}`}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-semibold leading-[19px] text-text md:text-[15.5px] md:leading-[21px]" title={r.title ?? undefined}>{title}</span>
          {/* desktop: the number only */}
          <span className="font-num mt-[3px] hidden truncate text-xs text-text-4 md:block">{caseNumber(r)}</span>
          {/* mobile: «number · court · circuit» */}
          <span className="mt-[3px] block truncate text-[11.5px] leading-4 text-text-4 md:hidden">
            <span className="font-num">{caseNumber(r)}</span>{where ? ` · ${where}` : ""}
          </span>
        </span>

        {/* desktop columns */}
        <span className="hidden truncate text-[13.5px] leading-[18px] text-text-3 md:block" title={where || undefined}>{where || "المحكمة غير محددة"}</span>
        <span className={`font-num hidden text-[14px] leading-[18px] md:block ${nextCls}`}>{nextText}</span>
        <span className="hidden justify-self-start md:block">{marker}</span>

        {/* mobile: date, marker under it */}
        <span className="flex shrink-0 flex-col items-end text-left md:hidden">
          <span className={`font-num text-[13px] leading-4 ${nextCls}`}>{nextText}</span>
          {marker ? <span className="mt-[3px] flex">{marker}</span> : null}
        </span>
      </Link>
    </li>
  );
}

export function CaseListHeader() {
  return (
    <div className={`hidden px-[30px] pb-3 pt-4 text-xs font-medium text-text-4 ${COLS}`}>
      <span>القضية</span><span>المحكمة</span><span>الجلسة الجاية</span><span className="sr-only">الحالة</span>
    </div>
  );
}
