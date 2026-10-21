/**
 * One case in the cases list (docs/design/*Cases.dc.html). Desktop (md+): a 4-column grid row under
 * CaseListHeader — case, court · circuit, next hearing, status. Mobile: avatar, title + meta, date + status.
 */
import Link from "next/link";
import type { CaseRow } from "@/lib/cases";
import { addDaysIso, formatDmy } from "@/lib/dates";
import { CASE_STATUS } from "@/lib/labels";

/** md+ column template, shared by the header and every row so they line up. */
export const COLS = "md:grid md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.9fr)] md:gap-4";

type Tone = "good" | "gold" | "warn" | "neutral" | "bad";
const TONE: Record<Tone, string> = {
  good: "bg-good-bg text-good",
  gold: "bg-[var(--accent-wash)] text-gold-text",
  warn: "bg-[var(--amber-bg)] text-[var(--amber-text)]",
  neutral: "bg-card-2 text-text-3",
  bad: "bg-bad-bg text-bad",
};
const STATUS_TONE: Record<CaseRow["status"], Tone> = {
  active: "good", reserved_for_judgment: "gold", judged: "neutral", suspended: "bad", closed: "neutral",
};

function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-bold ${TONE[tone]}`}>{children}</span>;
}

/** «client — subject». DB titles read «subject — client ضد opponent», so the subject is the part before « — ». */
export function caseTitle(r: CaseRow): string {
  const subject = (r.title?.split(" — ")[0] || r.case_type || "").trim();
  if (r.client?.name) return subject ? `${r.client.name} — ${subject}` : r.client.name;
  return r.title || subject || "دعوى بلا عنوان";
}

/** «سامح التجريبي» → «سا»… first letters of the first two words (the mockups' avatar). */
function initials(r: CaseRow): string {
  const w = (r.client?.name ?? caseTitle(r)).replace(/^(أ\.|الأستاذ|أستاذ)\s*/u, "").trim().split(/\s+/).filter(Boolean);
  return w.length > 1 ? w[0][0] + w[1][0] : (w[0] ?? "؟").slice(0, 2);
}

function dateLabel(iso: string, today: string): { text: string; soon: boolean } {
  if (iso === today) return { text: "النهارده", soon: true };
  if (iso === addDaysIso(today, 1)) return { text: "بكرة", soon: true };
  return { text: formatDmy(iso), soon: false };
}

export function CaseListRow({ r, today, needsReview }: { r: CaseRow; today: string; needsReview: boolean }) {
  const title = caseTitle(r);
  const where = [r.court, r.circuit].filter(Boolean).join(" · ");
  const next = r.next_hearing ? dateLabel(r.next_hearing, today) : null;
  // the real status always shows; «needs review» is an extra amber marker (Fable review)
  const status = <span className="inline-flex flex-wrap items-center gap-1.5"><Chip tone={STATUS_TONE[r.status]}>{CASE_STATUS[r.status]}</Chip>{needsReview ? <Chip tone="warn">محتاجة مراجعة</Chip> : null}</span>;
  return (
    <li className="border-b border-border-2 last:border-b-0">
      <Link href={`/cases/${r.id}`}
        className={`flex items-center gap-3 py-3 transition-colors md:items-center md:px-5 md:hover:bg-card-2 ${COLS}`}>
        {/* case: avatar, title, number */}
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span aria-hidden
            className={`inline-flex size-[38px] shrink-0 items-center justify-center rounded-full text-xs font-extrabold md:size-9 ${next?.text === "النهارده" ? "mark" : "bg-card-3 text-text-2"}`}>
            {initials(r)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-bold text-text md:text-[14.5px]" title={r.title ?? undefined}>{title}</span>
            {/* desktop: «772 لسنة 2025» */}
            <span className="hidden truncate text-xs text-text-3 md:block">
              {r.case_number ? <><span className="font-num">{r.case_number}</span>{r.case_year ? <> لسنة <span className="font-num">{r.case_year}</span></> : null}</> : "بلا رقم"}
            </span>
            {/* mobile: «court · 772/2025» */}
            <span className="mt-px flex min-w-0 gap-1 text-[11.5px] text-text-3 md:hidden">
              <span className="min-w-0 truncate">{r.court?.replace(/^محكمة\s+/u, "") ?? "المحكمة غير محددة"}</span>
              {r.case_number ? <span className="shrink-0">· <span className="num font-num">{r.case_number}{r.case_year ? `/${r.case_year}` : ""}</span></span> : null}
            </span>
          </span>
        </span>

        {/* desktop columns */}
        <span className="hidden truncate text-[13px] text-text-2 md:block" title={where || undefined}>{where || "—"}</span>
        <span className={`hidden text-[13px] font-bold md:block ${next ? (next.soon ? "text-gold-text" : "text-text-2") : "font-normal text-text-4"}`}>
          {next ? <span className={next.soon ? "" : "num font-num"}>{next.text}</span> : "لا جلسة"}
        </span>
        <span className="hidden justify-self-start md:block">{status}</span>

        {/* mobile: date + status */}
        <span className="shrink-0 text-left md:hidden">
          <span className={`block text-xs font-bold ${next ? (next.soon ? "text-gold-text" : "text-text-2") : "font-normal text-text-4"}`}>
            {next ? <span className={next.soon ? "" : "num font-num"}>{next.text}</span> : "لا جلسة"}
          </span>
          <span className="mt-px block text-[10px] text-text-4">{CASE_STATUS[r.status]}</span>
          {needsReview ? <span className="mt-px block text-[10px] font-bold text-[var(--amber-text)]">محتاجة مراجعة</span> : null}
        </span>
      </Link>
    </li>
  );
}

export function CaseListHeader() {
  return (
    <div className={`hidden border-b border-border-2 bg-gradient-to-b from-[var(--accent-ring)] to-transparent px-5 py-3 text-xs font-semibold text-text-3 ${COLS}`}>
      <span>القضية</span><span>المحكمة</span><span>الجلسة الجاية</span><span>الحالة</span>
    </div>
  );
}
