// OWNER: case-pages agent. Case hero: title, subject, court · circuit, status chip, next-hearing date block.
import { cx } from "@/components/ui";
import { formatDayLabel } from "@/lib/dates";
import { CASE_STATUS, caseLabel } from "@/lib/labels";

type Status = keyof typeof CASE_STATUS;

function statusTone(s: Status) {
  if (s === "reserved_for_judgment" || s === "suspended") return "bg-suggest-soft text-suggest";
  if (s === "active") return "bg-ok-soft text-ok";
  return "bg-surface-2 text-ink-3";
}

export function CaseHero({ c, isToday }: {
  c: { case_number: string | null; case_year: number | null; title: string | null; court: string | null; circuit: string | null; status: Status; next_hearing: string | null };
  isToday: boolean;
}) {
  const where = [c.court, c.circuit].filter(Boolean).join(" · ");
  const [y, m, d] = c.next_hearing ? c.next_hearing.slice(0, 10).split("-").map(Number) : [];
  const weekday = c.next_hearing ? formatDayLabel(c.next_hearing).split(" ")[0] : "";
  return (
    <header className="mt-1 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-[34px] font-bold leading-tight tracking-tight text-ink">{caseLabel(c)}</h1>
        {c.title && (c.case_number || c.case_year) ? <p className="mt-1.5 text-[17px] text-ink-2">{c.title}</p> : null}
        <p className="mt-1 text-[13px] text-ink-3">{where || "المحكمة غير محددة"}</p>
        <span className={cx("mt-3 inline-flex items-center rounded-full px-2.5 py-1 text-[13px] font-medium", statusTone(c.status))}>{CASE_STATUS[c.status]}</span>
      </div>
      <div className="min-w-[7.5rem] rounded-[var(--radius)] bg-surface px-4 py-3 text-center shadow-1">
        <p className="text-[13px] text-ink-3">الجلسة القادمة</p>
        {c.next_hearing ? (
          <>
            <p className={cx("num mt-1 text-[34px] font-bold leading-none", isToday ? "text-accent" : "text-ink")}>{d}</p>
            <p className="num mt-1 text-[13px] text-ink-2">{m}/{y}</p>
            <p className="text-[13px] text-ink-3">{isToday ? "اليوم" : weekday}</p>
          </>
        ) : <p className="mt-2 text-[15px] text-ink-3">لا جلسة قادمة</p>}
      </div>
    </header>
  );
}
