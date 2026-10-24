/** The agenda's address (the old Roll lived at /hearings, which now redirects here). No server-only import: the client uses it too. */
import { formatDmy } from "@/lib/dates";

export const AGENDA = "/agenda";
export type AgendaView = "day" | "week" | "month";
/** the agenda's two tabs: the days (الأجندة) and the past hearings that still have no decision (محتاجة قرار) */
export type AgendaTab = "agenda" | "decide";

/** `/agenda?view=day&date=d/m/yyyy` (the date is written as the lawyer reads it) */
export const agendaHref = (date: string, view: AgendaView = "day") => `${AGENDA}?view=${view}&date=${formatDmy(date)}`;
/** the «محتاجة قرار» tab: the sidebar's badge, the home card, the morning block and the case page's «القرار متسجلش · سجّله» all open it */
export const DECIDE_HREF = `${AGENDA}?tab=decide`;
/** which tab an address asks for (`?decide=1`, the old flow's address, still means the decision tab) */
export const tabOf = (sp: { get(k: string): string | null }): AgendaTab => (sp.get("tab") === "decide" || sp.get("decide") === "1" ? "decide" : "agenda");
