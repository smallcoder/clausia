/** Small time words for the editor (Cairo time; digits are Western like the rest of the app). */

/** «26/10/2026 14:05» */
export function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${p("day")}/${p("month")}/${p("year")} ${p("hour")}:${p("minute")}`;
}

/** «دلوقتي», «من دقيقة», «من دقيقتين», «من 5 دقايق», «من ساعة» … (never below the minute) */
export function ago(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "دلوقتي";
  if (m < 60) return m === 1 ? "من دقيقة" : m === 2 ? "من دقيقتين" : m <= 10 ? `من ${m} دقايق` : `من ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? "من ساعة" : h === 2 ? "من ساعتين" : h <= 10 ? `من ${h} ساعات` : `من ${h} ساعة`;
  const d = Math.floor(h / 24);
  return d === 1 ? "من يوم" : d === 2 ? "من يومين" : d <= 10 ? `من ${d} أيام` : `من ${d} يوم`;
}
