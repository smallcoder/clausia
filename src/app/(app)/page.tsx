// Home: the assistant first, then today's / tomorrow's agenda, then one summary row for hearings that need a decision.
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { HomeComposer } from "@/components/chat/HomeComposer";
import { cx } from "@/components/ui";
import { addDaysIso, formatDayLabel, formatDmy, todayIso } from "@/lib/dates";
import { hearingsInRange, undecidedPastHearings, type HearingWithCase } from "@/lib/hearings";
import { DECISION } from "@/lib/labels";
import { createClient, getSession } from "@/lib/supabase/server";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "صباح الخير" : "مساء الخير";
}

const caseNo = (h: HearingWithCase) => (h.case.case_number ? `الدعوى ${h.case.case_number}${h.case.case_year ? ` لسنة ${h.case.case_year}` : ""}` : h.case.title ?? "دعوى بلا رقم");

/** amber = needs a decision, green = upcoming, gray = done */
function Chip({ h, today }: { h: HearingWithCase; today: string }) {
  const [tone, label] = h.decision_type
    ? (["bg-surface-2 text-ink-3", DECISION[h.decision_type]] as const)
    : h.hearing_date <= today
      ? (["bg-suggest-soft text-suggest", "يحتاج قرارًا"] as const)
      : (["bg-ok-soft text-ok", "قادمة"] as const);
  return <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-caption font-medium", tone)}>{label}</span>;
}

function Section({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="mb-2 flex items-baseline gap-2 px-4 text-caption font-medium text-ink-3">
        <span>{title}</span>
        {meta ? <span className="num">{meta}</span> : null}
      </h2>
      {children}
    </section>
  );
}

function Agenda({ items, today, empty }: { items: HearingWithCase[]; today: string; empty: string }) {
  if (!items.length) return <p className="rounded-[var(--radius)] bg-surface px-4 py-4 text-callout text-ink-3 shadow-[var(--shadow-1)]">{empty}</p>;
  return (
    <ul className="overflow-hidden rounded-[var(--radius)] bg-surface shadow-[var(--shadow-1)]">
      {items.map((h, i) => (
        <li key={h.id}>
          <Link href={`/cases/${h.case_id}?tab=hearings`} className="flex ps-4 transition hover:bg-surface-2">
            <span className={cx("flex min-h-14 flex-1 items-center gap-3 py-2.5 pe-3", i > 0 && "border-t border-[var(--hairline)]")}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-semibold text-ink">{h.case.court ?? "محكمة غير محددة"}</span>
                <span className="block truncate text-caption tabular-nums text-ink-3">{caseNo(h)}</span>
              </span>
              <Chip h={h} today={today} />
              <ChevronLeft aria-hidden size={18} strokeWidth={1.5} className="shrink-0 text-ink-3" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function Home() {
  const db = await createClient();
  const today = todayIso();
  const tomorrow = addDaysIso(today, 1);
  const [session, upcoming, undecided] = await Promise.all([getSession(db), hearingsInRange(db, today, tomorrow), undecidedPastHearings(db)]);
  const todays = upcoming.filter((h) => h.hearing_date === today);
  const tomorrows = upcoming.filter((h) => h.hearing_date === tomorrow);
  const name = session?.displayName && !session.displayName.includes("@") ? `، ${session.displayName}` : "";

  return (
    <div className="mx-auto max-w-[760px]">
      <header className="mb-5 px-1">
        <p className="text-caption font-medium text-ink-3">{formatDayLabel(today)}</p>
        <h1 className="mt-1 text-title font-bold tracking-tight text-ink">{greeting()}{name}</h1>
      </header>

      <HomeComposer />

      {undecided.length ? (
        <details className="group mt-6 overflow-hidden rounded-[var(--radius)] bg-suggest-soft">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="size-2.5 shrink-0 rounded-full bg-suggest" aria-hidden />
            <span className="flex-1 text-body font-semibold text-suggest"><span className="num">{undecided.length}</span> جلسات تحتاج قرارًا</span>
            <ChevronLeft aria-hidden size={18} strokeWidth={1.5} className="shrink-0 text-suggest transition group-open:-rotate-90" />
          </summary>
          <ul className="bg-surface">
            {undecided.map((h, i) => (
              <li key={h.id} className={cx(i > 0 && "border-t border-[var(--hairline)]")}>
                <Link href={`/cases/${h.case_id}?tab=hearings`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition hover:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-semibold text-ink">{h.case.court ?? "محكمة غير محددة"}</span>
                    <span className="block truncate text-caption tabular-nums text-ink-3">{caseNo(h)} · جلسة {formatDmy(h.hearing_date)}</span>
                  </span>
                  <ChevronLeft aria-hidden size={18} strokeWidth={1.5} className="shrink-0 text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <Section title="اليوم" meta={todays.length ? `${todays.length} جلسات` : undefined}>
        <Agenda items={todays} today={today} empty="لا جلسات اليوم." />
      </Section>
      <Section title={`الغد · ${formatDmy(tomorrow)}`} meta={tomorrows.length ? `${tomorrows.length} جلسات` : undefined}>
        <Agenda items={tomorrows} today={today} empty="لا جلسات غدًا." />
      </Section>

      <p className="mt-6 px-4 text-caption text-ink-3">
        <Link href="/hearings" className="text-accent">رول الجلسات كاملًا</Link>
      </p>
    </div>
  );
}
