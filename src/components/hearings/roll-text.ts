/** Wording for the roll (رول الجلسات): Arabic counts, a hearing's title / number / status. Pure, no React. */
import { formatDmy } from "@/lib/dates";
import type { HearingWithCase } from "@/lib/hearings";
import { DECISION } from "@/lib/labels";

/** «جلسة واحدة / جلستين / 3 جلسات / 12 جلسة» */
export function nHearings(n: number): string {
  if (n === 1) return "جلسة واحدة";
  if (n === 2) return "جلستين";
  if (n >= 3 && n <= 10) return `${n} جلسات`;
  return `${n} جلسة`;
}

/** «محكمة واحدة / محكمتين / 3 محاكم / 12 محكمة» */
export function nCourts(n: number): string {
  if (n === 1) return "محكمة واحدة";
  if (n === 2) return "محكمتين";
  if (n >= 3 && n <= 10) return `${n} محاكم`;
  return `${n} محكمة`;
}

/** The short count under a day tile: «لا جلسات / جلسة / جلستين / 3 جلسات». */
export function dayCount(n: number): string {
  if (n === 0) return "لا جلسات";
  if (n === 1) return "جلسة";
  return nHearings(n);
}

/** «client — subject», falling back to whichever is known. */
export function hearingTitle(h: HearingWithCase): string {
  const c = h.case;
  const subject = c.title?.trim() || null;
  const client = c.client_name?.trim() || null;
  if (client && subject) return `${client} — ${subject}`;
  return client ?? subject ?? (c.case_number ? `الدعوى ${c.case_number}` : "دعوى بلا عنوان");
}

/** «8833 لسنة 2024» (long) or «8833/2024» (short); null when the case has no number yet. */
export function caseNumber(h: HearingWithCase, short = false): string | null {
  const { case_number: n, case_year: y } = h.case;
  if (!n) return null;
  if (!y) return n;
  return short ? `${n}/${y}` : `${n} لسنة ${y}`;
}

export type RollTone = "warn" | "good" | "neutral";

/** needs a decision (held, nothing recorded) = warn · upcoming = good · decided = neutral with the decision and next date */
export function hearingStatus(h: HearingWithCase, today: string): { tone: RollTone; label: string; next?: string } {
  if (h.decision_type) return { tone: "neutral", label: DECISION[h.decision_type], next: h.next_date ? formatDmy(h.next_date) : undefined };
  if (h.hearing_date <= today) return { tone: "warn", label: "محتاجة قرار" };
  return { tone: "good", label: "قادمة" };
}
