/**
 * Plain, JSON-safe shapes of Home's chat side: the morning brief (cached in `daily_briefs.payload`), the «Clausia noticed»
 * cards and the suggestion chips. No server-only import: the same types are used by the builders, the loader and the client.
 */
import type { CiteSource } from "@/components/cite/context";
import type { HearingWithCase } from "@/lib/hearings";

/**
 * Where a fact came from. Every fact in the brief and on a card carries one; a fact that cannot name its source is left out.
 *  - paper:  a paper (the chip opens the cite panel at that page and, when known, the exact sentence)
 *  - chat:   the lawyer's own message («من رسالتك»)
 *  - manual: the lawyer typed it in the app («إدخال يدوي»)
 * (A law source — law + article — is not used yet: the brief has no law facts; the deadlines flag is off.)
 */
export type SourceRef =
  | { kind: "paper"; cite: CiteSource }
  | { kind: "chat"; label: string }
  | { kind: "manual"; label: string };

/** A piece of a sentence; `gold` marks the part that matters (the day, the paper). */
export interface Seg { text: string; gold?: boolean }

/** One sentence of the brief and the sources of the facts in it (chips under the sentence). */
export interface BriefSentence { parts: Seg[]; sources: SourceRef[] }

export const BRIEF_VERSION = 1;

/** What is saved in `daily_briefs.payload`. */
export interface BriefPayload {
  v: typeof BRIEF_VERSION;
  /** the Cairo day it was built for (yyyy-mm-dd) */
  forDate: string;
  /** when it was built (ISO instant): the stamp and the time in the line under it */
  builtAt: string;
  /** 1–3 sentences; empty when there is nothing to say (then `empty` is true and `quiet` is said) */
  sentences: BriefSentence[];
  empty: boolean;
  /** the cases the brief was built from (hearings this week + new papers) and the papers that are new since yesterday */
  cases: number;
  newDocs: number;
}

/** «سجّل القرار» card: a hearing before today with no decision. */
export interface HearingNotice {
  kind: "hearing_decision";
  /** the dismissal key: the hearing id */
  key: string;
  hearing: HearingWithCase;
  /** «client — subject» */
  title: string;
  /** «جلسة 15/10/2026 فاتت من غير قرار.» */
  text: string;
  source: SourceRef | null;
}

/** «شوف الورقتين» card: one case, the same event in two papers with two different dates. */
export interface ConflictNotice {
  kind: "date_conflict";
  /** the dismissal key: the two fact ids, sorted, joined with ":" */
  key: string;
  caseId: string;
  title: string;
  /** «نفس الواقعة بتاريخين مختلفين: 15/3/2026 في الصحيفة، و15/4/2026 في الإنذار. أنهي الصح؟» */
  text: string;
  /** the first fact's own words (the card quotes it so the lawyer sees which event it is) */
  quote: string;
  /** one chip per paper */
  sources: SourceRef[];
}

export type Notice = HearingNotice | ConflictNotice;

/** A suggestion chip: it fills the composer with `text` (never sends). `icon` is the small glyph before the label. */
export interface Chip { label: string; text: string; icon?: "calendar" | "gavel" | "file" | "folder" }

/** What the chat panel's top shows in the general context. */
export interface MorningData {
  brief: BriefPayload;
  notices: Notice[];
  /** undecided hearings that did not fit in the cards (a link points at them) */
  moreUndecided: number;
  chips: Chip[];
  /** Cairo today (yyyy-mm-dd), for the decision sheet */
  today: string;
  /** «مساء الخير، أستاذ تجريبي» (the phone shows it on top of the chat; the desktop page has it) */
  greeting: string;
}
