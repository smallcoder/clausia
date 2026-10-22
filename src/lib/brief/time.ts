/**
 * Clock rules of the brief and its reminder, all in Africa/Cairo and all pure (they take `now`, so a test can fix the instant).
 *  - From 20:00 Cairo the brief of tomorrow is «جاهز» (the bell shows it, one browser notification a day).
 *  - «ذكّرني الصبح 7» = 07:00 Cairo on the hearings day.
 * Egypt has summer time again (UTC+3 in summer, UTC+2 in winter), so nothing here uses a fixed offset: the zone database decides.
 */
import { addDaysIso } from "@/lib/dates";

const TZ = "Africa/Cairo";
/** the brief is ready from this hour (24h clock, Cairo) */
export const BRIEF_HOUR = 20;
/** «ذكّرني الصبح 7» */
export const REMIND_HOUR = 7;

const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** The wall clock in Cairo at `now`: date as yyyy-mm-dd, hour 0–23, minute 0–59. */
export function cairoClock(now: Date): { date: string; hour: number; minute: number } {
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, minute: Number(p.minute) };
}

/** Milliseconds Cairo is ahead of UTC at that instant (2h in winter, 3h in summer). */
function offsetMs(at: Date): number {
  const c = cairoClock(at);
  const [y, m, d] = c.date.split("-").map(Number);
  return Date.UTC(y, m - 1, d, c.hour, c.minute) - Math.floor(at.getTime() / 60_000) * 60_000;
}

/** The instant at which the Cairo wall clock reads `hour:minute` on `isoDate`. */
export function cairoInstant(isoDate: string, hour: number, minute = 0): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, hour, minute);
  const first = wall - offsetMs(new Date(wall - 3 * 3_600_000));
  return new Date(wall - offsetMs(new Date(first)));
}

/** The day the brief is about when it is sent: tomorrow in Cairo. */
export function briefDay(now: Date): string {
  return addDaysIso(cairoClock(now).date, 1);
}

/** True from 20:00 until midnight Cairo (then «tomorrow» is today and the evening brief is over). */
export function briefReady(now: Date): boolean {
  return cairoClock(now).hour >= BRIEF_HOUR;
}

/** The instant of «الصبح 7» on the hearings day. */
export function remindInstant(forDate: string): Date {
  return cairoInstant(forDate, REMIND_HOUR);
}

/** A reminder is due when its instant has come and it is not older than a day (an old one is not shown as news). */
export function reminderDue(remindAt: Date | string, now: Date): boolean {
  const t = new Date(remindAt).getTime();
  return t <= now.getTime() && now.getTime() - t < 86_400_000;
}
