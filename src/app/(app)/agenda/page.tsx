// OWNER: agenda agent — الأجندة (replaces the Roll at /hearings; mockups docs/design/ia/IAAgenda*, MAgenda*, BannerOpts*). Two tabs: «الأجندة» — the title row
// (day / week / month switch, month arrows, «النهارده»), the day strip, then the day's deadlines (flag-gated) and hearings by court building and circuit — and
// «محتاجة قرار», every past hearing with no decision, each recorded inside its row. ?tab=decide, ?view=day|week|month, ?date=d/m/yyyy.
// The day / week / month views run on the client (AgendaView) from a per-day cache; this page renders its first view with the chosen week ±4 weeks.
// The chat panel beside the page is the "agenda" context (@chat/agenda): the general sessions, as the Roll's was.
import { AgendaView } from "@/components/agenda/AgendaView";
import { DECIDE_ROWS } from "@/components/agenda/decide";
import { addDaysIso, parseDmy, todayIso } from "@/lib/dates";
import { deadlinesInRange } from "@/lib/deadlines/roll";
import { hearingsInRange, undecidedPastCount, undecidedPastHearings, weekStart } from "@/lib/hearings";
import { createClient } from "@/lib/supabase/server";

/** weeks of rows rendered on each side of the chosen week (the client keeps this buffer while scrolling) */
const SSR_WEEKS = 4;

export default async function Agenda({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const sp = await searchParams;
  const today = todayIso();
  const parsed = parseDmy(sp.date ?? "");
  const date = parsed?.precision === "day" ? parsed.iso : today;
  const wk = weekStart(date);
  const from = addDaysIso(wk, -7 * SSR_WEEKS);
  const to = addDaysIso(wk, 7 * SSR_WEEKS + 6);

  const db = await createClient();
  const [rows, deadlines, undecided, undecidedRows] = await Promise.all([
    hearingsInRange(db, from, to),
    deadlinesInRange(db, from, to), // none with the deadlines flag off
    undecidedPastCount(db),
    undecidedPastHearings(db, DECIDE_ROWS), // the tab lists at most this many (oldest first); its number is the real count
  ]);

  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col px-4 sm:px-10">
      <AgendaView today={today} from={from} to={to} rows={rows} deadlines={deadlines} undecided={undecided} undecidedRows={undecidedRows} />
    </div>
  );
}
