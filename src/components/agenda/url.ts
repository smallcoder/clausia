/** The agenda's address (the old Roll lived at /hearings, which now redirects here). No server-only import: the client uses it too. */
import { formatDmy } from "@/lib/dates";

export const AGENDA = "/agenda";
export type AgendaView = "day" | "week" | "month";

/** `/agenda?view=day&date=d/m/yyyy` (the date is written as the lawyer reads it) */
export const agendaHref = (date: string, view: AgendaView = "day") => `${AGENDA}?view=${view}&date=${formatDmy(date)}`;
/** opens the one-by-one decision flow on load */
export const DECIDE_HREF = `${AGENDA}?decide=1`;
