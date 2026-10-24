/**
 * One day's hearings (docs/design/ia/IAAgenda*, MAgenda*): grouped by court building (the court, with the floor / hall where it is
 * known, and the count), and inside each group in circuit order. Each court card reads top to bottom: the court's line, the column names
 * (الدائرة · رقم الدعوى · الموكل ضد الخصم · المطلوب), then the rows. There is no shared header above the cards.
 * A row opens the case's hearings tab. No decision inputs here: a past hearing without a decision is recorded in the «محتاجة قرار» tab (DecideList).
 * No hooks, so it renders on either side.
 *
 * Building / floor / hall: only `hearings.location` as written in a paper or said by the lawyer ("الدور 4 · قاعة 12", "العباسية"); a court with
 * no location is a group by court alone. Never guessed.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { caseNumber, hearingTitle, nHearings } from "@/components/hearings/roll-text";
import { DateText, cx } from "@/components/ui";
import { circuitNumber, courtOf, groupBy, type HearingWithCase } from "@/lib/hearings";
import { DECISION } from "@/lib/labels";

/** the four columns on desktop (fr shares, so the page width decides the lengths) */
const GRID = "sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,3fr)_minmax(0,2fr)]";
const PAD = "px-4 sm:px-6";

const byCircuit = (a: HearingWithCase, b: HearingWithCase) => {
  const x = circuitNumber(a), y = circuitNumber(b);
  if (x && y && x !== y) return Number(x) - Number(y);
  if (!x !== !y) return x ? -1 : 1; // a circuit with a number first
  return (a.case.circuit ?? "").localeCompare(b.case.circuit ?? "", "ar") || (a.case.case_number ?? "").localeCompare(b.case.case_number ?? "", "ar", { numeric: true });
};

/** «الدائرة 3 إيجارات» → «3 إيجارات» (desktop) */
const shortCircuit = (c: string) => c.replace(/^الدائرة\s+/, "");

/** The groups of one day: by court + where it sits, then by circuit. Exported for the tests. */
export function agendaGroups(rows: HearingWithCase[]): { key: string; court: string; place: string | null; items: HearingWithCase[] }[] {
  const sorted = [...rows].sort((a, b) => courtOf(a).localeCompare(courtOf(b), "ar") || (a.location ?? "").localeCompare(b.location ?? "", "ar") || byCircuit(a, b));
  return groupBy(sorted, (h) => `${courtOf(h)}\u0000${h.location?.trim() ?? ""}`).map((g) => ({
    key: g.key, court: courtOf(g.items[0]), place: g.items[0].location?.trim() || null, items: g.items,
  }));
}

/** The column names inside a court card, between its line and its rows (desktop only). */
function Columns() {
  return (
    <div aria-hidden className={cx("hidden gap-x-4 pb-2.5 text-sm text-text-3 sm:grid", GRID, PAD)}>
      <span>الدائرة</span><span>رقم الدعوى</span><span>الموكل ضد الخصم</span><span>المطلوب</span>
    </div>
  );
}

/** «client ضد opponent» (the client alone when no opponent is saved; the case's title when there is no client). Also the «محتاجة قرار» rows. */
export function Sides({ h }: { h: HearingWithCase }): ReactNode {
  const { client_name: client, opponent } = h.case;
  if (!client) return hearingTitle(h);
  return opponent ? <>{client} <span className="font-normal text-text-3">ضد</span> {opponent}</> : client;
}

export function AgendaRow({ h }: { h: HearingWithCase }) {
  const c = h.case;
  const circuit = c.circuit?.trim() || null;
  const need = h.purpose?.trim() || null;
  const num = caseNumber(h);
  return (
    <Link href={`/cases/${c.id}?tab=hearings&hearing=${h.id}`}
      className={cx("grid gap-x-4 gap-y-1.5 py-3.5 transition hover:bg-card-2 sm:items-center sm:py-4", GRID, PAD)}>
      <span className="flex items-baseline justify-between gap-3 sm:contents">
        <span className="min-w-0 truncate text-base font-bold text-text sm:text-md">
          {circuit ? <><span className="sm:hidden">{circuit}</span><span className="hidden sm:inline">{shortCircuit(circuit)}</span></> : <span className="text-text-3">بلا دائرة</span>}
        </span>
        <span className="shrink-0 text-base text-text-3 sm:min-w-0 sm:shrink sm:truncate">{num ?? "بلا رقم"}</span>
      </span>
      <span className="min-w-0 text-md font-bold leading-[1.5] text-text sm:truncate"><Sides h={h} /></span>
      <span className="min-w-0 text-base text-text-3 sm:truncate">
        {need ? <><span className="sm:hidden">المطلوب: </span><span>{need}</span></> : "—"}
        {h.decision_type ? (
          <span className="mt-0.5 block truncate text-sm text-text-3">
            القرار: {DECISION[h.decision_type]}{h.next_date ? <> ← <DateText iso={h.next_date} /></> : null}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

export function AgendaGroups({ rows }: { rows: HearingWithCase[] }) {
  return (
    <div className="space-y-3.5 sm:space-y-4">
      {agendaGroups(rows).map((g) => (
        <section key={g.key} aria-label={g.court} className="overflow-hidden rounded-xl border border-border-2 bg-card shadow-card">
          <div className={cx("flex items-baseline justify-between gap-3 pb-2 pt-3.5 sm:pb-1", PAD)}>
            <h3 className="min-w-0 truncate text-md font-bold text-text">
              {g.court}
              {g.place ? <span className="ms-2.5 text-sm font-normal text-text-3">{g.place}</span> : null}
            </h3>
            <span className="hidden shrink-0 text-sm text-text-3 sm:inline">{nHearings(g.items.length)}</span>
          </div>
          <Columns />
          <ul className="divide-y divide-border-2 border-t border-border-2">
            {g.items.map((h) => <li key={h.id}><AgendaRow h={h} /></li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}
