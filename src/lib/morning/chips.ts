/**
 * The 2–3 suggestion chips under the cards, built from the lawyer's OWN cases (code only). A chip fills the composer and sends
 * nothing; the lawyer reads it, changes it and sends it. Fewer than 2 chips from the cases → the generic ones fill the rest.
 *
 *  - «سجّل قرار جلسة <who> <d/m>»        the oldest hearing before today with no decision
 *  - «إيه المطلوب في <who> الجلسة الجاية؟» the next hearing (today or later)
 *  - «ارفع ورقة لقضية <who>»              the next hearing's case lacks a paper its requirement names (the brief page's missing rules)
 */
import { whoOf } from "@/lib/brief/build";
import type { HearingWithCase } from "@/lib/hearings";
import { shortDm } from "@/components/hearings/roll-text";
import type { Chip } from "./types";

export const MAX_CHIPS = 3;

/** Used when the cases give fewer than two chips (nothing undecided, nothing coming, nothing missing). */
export const GENERIC_CHIPS: Chip[] = [
  { label: "جهّزلي جلسة بكرة", text: "جهّزلي جلسة بكرة", icon: "calendar" },
  { label: "سجّل قرارات الجلسات اللي فاتت", text: "سجّل قرارات الجلسات اللي فاتت", icon: "gavel" },
  { label: "اسأل عن قضية", text: "قولّي إيه آخر حاجة في قضية ", icon: "folder" },
];

export interface ChipInput {
  /** the oldest undecided hearing before today */
  undecided: HearingWithCase | null;
  /** the next hearing, today or later */
  next: HearingWithCase | null;
  /** the next hearing's case lacks a paper its requirement names (`missingFor` rule «document») */
  nextMissingPaper: boolean;
}

export function buildChips(i: ChipInput): Chip[] {
  const out: Chip[] = [];
  if (i.undecided) {
    const who = whoOf(i.undecided);
    const d = shortDm(i.undecided.hearing_date);
    if (who) out.push({ label: `سجّل قرار جلسة ${/^\d/.test(who) ? `قضية ${who}` : who} ${d}`, text: `قرار جلسة ${d} في قضية ${who}: `, icon: "gavel" });
  }
  if (i.next) {
    const who = whoOf(i.next);
    if (who) {
      out.push({ label: `إيه المطلوب في ${/^\d/.test(who) ? `قضية ${who}` : who} الجلسة الجاية؟`, text: `إيه المطلوب في قضية ${who} الجلسة الجاية؟`, icon: "calendar" });
      if (i.nextMissingPaper) out.push({ label: `ارفع ورقة لقضية ${who}`, text: `هرفع ورقة لقضية ${who}`, icon: "file" });
    }
  }
  const own = out.slice(0, MAX_CHIPS);
  // the generic ones top it up to two
  for (const g of GENERIC_CHIPS) { if (own.length >= 2) break; if (!own.some((c) => c.label === g.label)) own.push(g); }
  return own;
}
