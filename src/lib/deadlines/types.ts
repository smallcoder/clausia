/** The shapes of the deadlines card (shared by the server that computes it and the card that draws it). No server-only code here. */

export type DeadlineKind = "appeal" | "cassation";
export type StartBasis = "judgment_date" | "service_date";

/** One article as the card knows it: a label for the chip and, when LawMill had it, the verbatim text. */
export interface ArticleRef {
  number: string;
  /** «مرافعات · م 227» */
  label: string;
  ok: boolean;
  text?: string;
  version_id?: string;
  /** why there is no text: «النص مش متاح في LawMill دلوقتي» */
  note?: string;
}

export interface DeadlineRowView {
  kind: DeadlineKind;
  /**
   * ready: days and last day computed · after_appeal: first-instance judgment, cassation runs from the appeal judgment (no date) ·
   * review_article: the days could not be read from the article («راجع المادة») · need_service_date: not حضوري and no service date yet
   */
  state: "ready" | "after_appeal" | "review_article" | "need_service_date";
  days: number | null;
  last_day: string | null;
  raw_last_day: string | null;
  moved: boolean;
  /** the last day is in a year with no approved holidays: «راجع الإجازات» */
  review_holidays: boolean;
  days_left: number | null;
  article: ArticleRef;
}

export interface DeadlineCardData {
  caseId: string;
  judgmentId: string;
  /** «كريم المثالي — صحة ونفاذ عقد بيع» */
  caseTitle: string;
  /** «حكم ابتدائي» / «حكم استئناف» */
  judgmentLabel: string;
  judgmentDate: string;
  caseNumber: string | null;
  /** the inputs this preview was computed from */
  basis: StartBasis;
  serviceDate: string | null;
  /** an error about the typed service date (never guessed: the lawyer must type a clear date) */
  startError: string | null;
  urgent: boolean;
  reminders: number[];
  today: string;
  rows: DeadlineRowView[];
  art213: ArticleRef;
  art18: ArticleRef;
}

/** Default reminders (the mockup draws «أسبوع» and «يوم قبلها» on). */
export const DEFAULT_REMINDERS = [7, 1] as const;
export const REMINDER_CHOICES = [
  { days: 7, label: "أسبوع" },
  { days: 3, label: "3 أيام" },
  { days: 1, label: "يوم قبلها" },
] as const;
