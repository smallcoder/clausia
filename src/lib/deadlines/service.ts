import "server-only";
/**
 * Builds the deadlines card and the row to save, all by code: the article text from LawMill (cached), the days read from it
 * (parse.ts), the last day (compute.ts) with the shared APPROVED holidays. The model never takes part, and the lawyer's inputs are only
 * facts: the start basis (judgment date or the date the judgment was served), the service date she typed, «مستعجل»,
 * the reminders. Every number on the card and in the saved row is recomputed here from those inputs, never taken from the client.
 */
import { parseDmy, todayIso } from "@/lib/dates";
import type { Database } from "@/lib/db/types";
import type { Db } from "@/lib/supabase/server";
import { daysBetween, lastDay, type HolidayInfo } from "./compute";
import { getArticle, PROCEDURE_LAW, type Article, type ArticleResult } from "./lawmill";
import { parseAppealDays, parseCassationDays, type ParsedDays } from "./parse";
import type { ArticleRef, DeadlineCardData, DeadlineKind, DeadlineRowView, StartBasis } from "./types";

export class DeadlineError extends Error {}

export interface DeadlineInputs {
  caseId: string;
  judgmentId: string;
  kind: DeadlineKind;
  startBasis: StartBasis;
  /** typed by the lawyer, d/m/yyyy; only read when startBasis = 'service_date' */
  serviceDate?: string | null;
  urgent: boolean;
  reminders: number[];
}

/** What is inserted into case_deadlines (the office, the user and the provenance are added by the caller / the database defaults). */
export type DeadlineSave = Omit<Database["public"]["Tables"]["case_deadlines"]["Insert"], "id" | "office_id" | "created_at" | "created_by" | "review_status" | "created_by_kind" | "source_kind">;

const LAW_LABEL = PROCEDURE_LAW.label;
const chip = (n: string) => `${LAW_LABEL} · م ${n}`;
const NOT_AVAILABLE = "نص المادة مش متاح من LawMill دلوقتي، راجع المادة بنفسك.";
const UNREACHABLE = "LawMill مردش دلوقتي، جرّب تاني بعد شوية.";

function refOf(n: string, r: ArticleResult): ArticleRef {
  if (r.ok) return { number: n, label: chip(n), ok: true, text: r.article.text_ar, version_id: r.article.version_id };
  return { number: n, label: chip(n), ok: false, note: r.reason === "missing" ? NOT_AVAILABLE : UNREACHABLE };
}

/** The approved holidays (shared table, read with the lawyer's own session). Drafts are never used. */
export async function loadHolidays(db: Db): Promise<HolidayInfo> {
  const { data, error } = await db.from("holidays").select("holiday_date").eq("status", "approved");
  if (error) throw new Error(error.message);
  const dates = new Set((data ?? []).map((h) => h.holiday_date));
  return { dates, approvedYears: new Set([...dates].map((d) => Number(d.slice(0, 4)))) };
}

export const cleanReminders = (r: readonly unknown[] | null | undefined): number[] =>
  [...new Set((r ?? []).map(Number))].filter((n) => Number.isInteger(n) && n >= 1 && n <= 365).sort((a, b) => b - a).slice(0, 8);

const STAGE_LABEL = { first_instance: "حكم ابتدائي", appeal: "حكم استئناف", cassation: "حكم نقض" } as const;

interface Built {
  card: DeadlineCardData;
  /** the row to save for `input.kind`; null when it cannot be saved yet (the reason is `blocked`) */
  save: DeadlineSave | null;
  blocked: string | null;
}

/** The card for these inputs and (when everything is clear) the row that «حطهم في الأجندة» saves. */
export async function buildDeadlines(db: Db, input: DeadlineInputs): Promise<Built> {
  const { data: c } = await db.from("cases").select("id, title, case_number, case_year, stage, clients(name)").eq("id", input.caseId).maybeSingle();
  if (!c) throw new DeadlineError("الدعوى مش موجودة");
  const { data: j } = await db.from("judgments").select("id, case_id, judgment_date, kind").eq("id", input.judgmentId).maybeSingle();
  if (!j || j.case_id !== c.id) throw new DeadlineError("الحكم مش موجود في الدعوى دي");
  if (!j.judgment_date) throw new DeadlineError("تاريخ الحكم مش متسجل");
  if (c.stage === "cassation") throw new DeadlineError("مفيش ميعاد طعن بعد حكم النقض");
  const wantKind: DeadlineKind = c.stage === "appeal" ? "cassation" : "appeal";
  if (input.kind !== wantKind) throw new DeadlineError("نوع الميعاد مش مناسب لدرجة الدعوى");
  const asOf = j.judgment_date;

  // the start of the period (art. 213): the judgment date, or the date the judgment was served when it is not حضوري
  let start: string | null = asOf;
  let startError: string | null = null;
  let service: string | null = null;
  if (input.startBasis === "service_date") {
    start = null;
    const raw = input.serviceDate?.trim();
    if (raw) {
      const p = parseDmy(raw);
      if (!p || p.precision !== "day") startError = "اكتب تاريخ الإعلان كامل بصيغة يوم/شهر/سنة، مثل 5/11/2026";
      else if (p.iso < asOf) startError = "تاريخ الإعلان لازم يكون بعد تاريخ الحكم أو في نفس اليوم";
      else if (p.iso > todayIso()) startError = "تاريخ الإعلان لسه ماجاش";
      else { start = p.iso; service = p.iso; }
    }
  }

  const [holidays, a213, a227, a252, a18] = await Promise.all([
    loadHolidays(db),
    getArticle("213", asOf),
    wantKind === "appeal" ? getArticle("227", asOf) : Promise.resolve<ArticleResult | null>(null),
    getArticle("252", asOf),
    getArticle("18", asOf),
  ]);

  const today = todayIso();
  const rows: DeadlineRowView[] = [];
  let save = null as DeadlineSave | null;
  let blocked = null as string | null;

  const readRow = (kind: DeadlineKind, number: string, res: ArticleResult, parsed: ParsedDays | null, runs: boolean): { row: DeadlineRowView; article?: Article } => {
    const article = refOf(number, res);
    const base: DeadlineRowView = { kind, state: "review_article", days: null, last_day: null, raw_last_day: null, moved: false, review_holidays: false, days_left: null, article };
    if (!res.ok || !parsed || !parsed.ok) return { row: base };
    if (!runs) return { row: { ...base, state: "after_appeal", days: parsed.days }, article: res.article };
    if (!start) return { row: { ...base, state: "need_service_date", days: parsed.days }, article: res.article };
    const d = lastDay(start, parsed.days, holidays);
    return { row: { ...base, state: "ready", days: parsed.days, last_day: d.last, raw_last_day: d.raw, moved: d.moved, review_holidays: d.reviewHolidays, days_left: daysBetween(today, d.last) }, article: res.article };
  };

  const saveFrom = (kind: DeadlineKind, row: DeadlineRowView, article: Article | undefined) => {
    if (kind !== input.kind) return;
    if (row.state !== "ready" || !article || !start || !row.days || !row.last_day || !row.raw_last_day) {
      blocked = row.state === "need_service_date" ? (startError ?? "اكتب تاريخ إعلان الحكم الأول") : "راجع المادة: ماقدرتش أقرا عدد الأيام من نصها";
      return;
    }
    save = {
      case_id: c.id, judgment_id: j.id, kind, start_date: start, start_basis: input.startBasis, days: row.days,
      raw_last_day: row.raw_last_day, last_day: row.last_day, urgent: kind === "appeal" && input.urgent, holidays_reviewed: !row.review_holidays,
      law_source_id: PROCEDURE_LAW.sourceId, article_number: article.article_number, version_id: article.version_id,
      article_sha256: article.text_sha256, article_text: article.text_ar, reminders: cleanReminders(input.reminders),
    };
  };

  if (wantKind === "appeal") {
    const parsed = a227 && a227.ok ? parseAppealDays(a227.article.text_ar, input.urgent) : null;
    const ap = readRow("appeal", "227", a227!, parsed, true);
    rows.push(ap.row);
    saveFrom("appeal", ap.row, ap.article);
    // the cassation row of a first-instance judgment: «بعد الاستئناف» (it runs from the appeal judgment, so no date)
    const cp = a252.ok ? parseCassationDays(a252.article.text_ar) : null;
    rows.push(readRow("cassation", "252", a252, cp, false).row);
  } else {
    const cp = a252.ok ? parseCassationDays(a252.article.text_ar) : null;
    const cr = readRow("cassation", "252", a252, cp, true);
    rows.push(cr.row);
    saveFrom("cassation", cr.row, cr.article);
  }

  const client = (c.clients as { name: string } | null)?.name;
  const card: DeadlineCardData = {
    caseId: c.id, judgmentId: j.id,
    caseTitle: [client, c.title].filter(Boolean).join(" — ") || (c.case_number ? `الدعوى رقم ${c.case_number}` : "دعوى بلا اسم"),
    judgmentLabel: STAGE_LABEL[c.stage], judgmentDate: asOf,
    caseNumber: c.case_number ? `${c.case_number}${c.case_year ? ` لسنة ${c.case_year}` : ""}` : null,
    basis: input.startBasis, serviceDate: service ?? (input.serviceDate?.trim() || null), startError,
    urgent: wantKind === "appeal" && input.urgent, reminders: cleanReminders(input.reminders), today, rows,
    art213: refOf("213", a213), art18: refOf("18", a18),
  };
  return { card, save, blocked };
}
