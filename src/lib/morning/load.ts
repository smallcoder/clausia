import "server-only";
/**
 * Home's chat side, read with the lawyer's own RLS client: the morning brief (built once per Cairo day, then read from
 * `daily_briefs`), the «Clausia noticed» cards and the chips (both live on every load, minus what this lawyer dismissed).
 */
import { cardsFor } from "@/lib/brief/load";
import { cairoInstant } from "@/lib/brief/time";
import { docName } from "@/components/cases/case-view";
import { greeting } from "@/components/home/text";
import { addDaysIso, todayIso } from "@/lib/dates";
import type { Json } from "@/lib/db/types";
import { hearingsInRange, undecidedPastHearings, upcomingHearings } from "@/lib/hearings";
import type { Db } from "@/lib/supabase/server";
import { buildMorning, WEEK_DAYS, type NewDoc } from "./build";
import { buildChips } from "./chips";
import { conflictNotice, dateConflicts, dismissalId, hearingNotice, MAX_NOTICES, pickNotices, type NoticeFact } from "./notices";
import { BRIEF_VERSION, type BriefPayload, type MorningData } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as T;
}

/** names («صحيفة افتتاح دعوى») of papers by id */
async function paperNames(db: Db, ids: (string | null)[]): Promise<Map<string, string>> {
  const want = [...new Set(ids.filter((x): x is string => !!x && UUID.test(x)))];
  const m = new Map<string, string>();
  if (!want.length) return m;
  for (const d of must(await db.from("documents").select("id, title, doc_type, file_name").in("id", want))) m.set(d.id, docName(d));
  return m;
}

/** «client — subject» of cases by id */
async function caseTitles(db: Db, ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (!ids.length) return m;
  for (const c of must(await db.from("cases").select("id, case_number, title, clients(name)").in("id", ids))) {
    const subject = c.title?.trim() || null;
    const client = c.clients?.name?.trim() || null;
    m.set(c.id, client && subject ? `${client} — ${subject}` : client ?? subject ?? (c.case_number ? `الدعوى ${c.case_number}` : "دعوى بلا عنوان"));
  }
  return m;
}

/** The brief of `today`: the saved one, else built now and saved (the first Home load of the day does it). */
async function briefOf(db: Db, userId: string, today: string): Promise<BriefPayload> {
  const read = async () => {
    const { data } = await db.from("daily_briefs").select("payload").eq("user_id", userId).eq("for_date", today).maybeSingle();
    const p = data?.payload as unknown as BriefPayload | undefined;
    return p && p.v === BRIEF_VERSION && p.forDate === today ? p : null;
  };
  const saved = await read();
  if (saved) return saved;

  const week = (await hearingsInRange(db, today, addDaysIso(today, WEEK_DAYS - 1))).filter((h) => h.review_status === "confirmed");
  const since = cairoInstant(addDaysIso(today, -1), 0).toISOString(); // «since yesterday» = from the start of yesterday, Cairo
  const docRows = must(await db.from("documents").select("id, case_id, title, doc_type, file_name").gte("created_at", since).neq("review_status", "rejected").order("created_at", { ascending: false }).limit(50));
  const caseIds = [...new Set(docRows.map((d) => d.case_id).filter((x): x is string => !!x))];
  const [docNames, caseRows] = await Promise.all([
    paperNames(db, week.map((h) => h.source_document_id)),
    caseIds.length ? db.from("cases").select("id, case_number, clients(name)").in("id", caseIds).then((r) => must(r)) : Promise.resolve([]),
  ]);
  const who = new Map(caseRows.map((c) => [c.id, c.clients?.name?.trim().split(/\s+/)[0] || c.case_number?.trim() || null]));
  const docs: NewDoc[] = docRows.map((d) => ({ id: d.id, name: docName(d), caseId: d.case_id, caseWho: d.case_id ? who.get(d.case_id) ?? null : null }));
  const payload = buildMorning({ today, now: new Date(), hearings: week, docNames, docs });

  // two tabs can race: the first row of the day wins, and both read it back
  await db.from("daily_briefs").upsert({ user_id: userId, for_date: today, payload: payload as unknown as Json }, { onConflict: "user_id,for_date", ignoreDuplicates: true });
  return (await read()) ?? payload;
}

export async function loadMorning(db: Db, userId: string, displayName: string): Promise<MorningData> {
  const today = todayIso();
  const [brief, undecided, dismissedRows, factRows, upcoming] = await Promise.all([
    briefOf(db, userId, today),
    undecidedPastHearings(db, 50),
    db.from("dismissed_notices").select("kind, key").then((r) => must(r)),
    db.from("case_facts").select("id, case_id, text, fact_date, date_precision, date_text, source_document_id, source_page, source_quote, source_char_start, source_char_end, created_at")
      .neq("review_status", "rejected").not("source_document_id", "is", null).not("fact_date", "is", null).eq("date_precision", "day")
      .then((r) => must(r) as NoticeFact[]),
    upcomingHearings(db, today, 1),
  ]);
  const dismissed = new Set(dismissedRows.map((r) => dismissalId(r.kind, r.key)));
  const liveUndecided = undecided.filter((h) => !dismissed.has(dismissalId("hearing_decision", h.id)));
  const conflicts = dateConflicts(factRows).filter((c) => !dismissed.has(dismissalId("date_conflict", c.key))).slice(0, MAX_NOTICES);
  const hearingsInCards = liveUndecided.slice(0, MAX_NOTICES); // the most that can fit; pickNotices keeps what does

  const [names, titles] = await Promise.all([
    paperNames(db, [...hearingsInCards.map((h) => h.source_document_id), ...conflicts.flatMap((c) => [c.a.source_document_id, c.b.source_document_id])]),
    caseTitles(db, [...new Set(conflicts.map((c) => c.caseId))]),
  ]);
  const notices = pickNotices(
    conflicts.map((c) => conflictNotice(c, titles.get(c.caseId) ?? "قضية", names)),
    hearingsInCards.map((h) => hearingNotice(h, names)),
    dismissed,
  );
  const moreUndecided = liveUndecided.length - notices.filter((n) => n.kind === "hearing_decision").length;

  // chips: the oldest undecided hearing still on the list, the next hearing, and whether its case lacks a paper
  const next = upcoming[0] ?? null;
  const missing = next ? (await cardsFor(db, [next]))[0]?.missing.some((m) => m.rule === "document") ?? false : false;
  const chips = buildChips({ undecided: liveUndecided[0] ?? null, next, nextMissingPaper: missing });
  return { brief, notices, moreUndecided, chips, today, greeting: greeting(displayName) };
}
