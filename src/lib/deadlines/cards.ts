import "server-only";
/**
 * The data behind the deadlines cards of a thread (server side, RLS client). A card that is still open is computed now from its
 * inputs; a card the lawyer already confirmed shows what was SAVED (the row's own days, last day and article text), so the thread never
 * shows a date that differs from the Roll. With the flag off nothing is loaded and no card shows.
 */
import { deadlinesEnabled } from "@/lib/flags";
import type { Proposal } from "@/lib/proposals";
import type { Db } from "@/lib/supabase/server";
import { daysBetween } from "./compute";
import { buildDeadlines, cleanReminders, DeadlineError } from "./service";
import type { DeadlineCardData, DeadlineKind, StartBasis } from "./types";

export type DeadlineCardEntry = { card: DeadlineCardData } | { error: string };

export interface DeadlineArgs { case: string; judgment: string; kind: DeadlineKind; start_basis?: StartBasis; service_date?: string; urgent?: boolean; reminders?: number[] }

export async function loadDeadlineCards(db: Db, proposals: Proposal[]): Promise<Record<string, DeadlineCardEntry>> {
  const out: Record<string, DeadlineCardEntry> = {};
  if (!deadlinesEnabled()) return out;
  for (const p of proposals) {
    const op = p.ops.find((o) => o.tool === "add_deadline");
    if (!op || op.status === "rejected") continue;
    const a = op.args as unknown as DeadlineArgs;
    try {
      const { card } = await buildDeadlines(db, {
        caseId: a.case, judgmentId: a.judgment, kind: a.kind, startBasis: a.start_basis ?? "judgment_date",
        serviceDate: a.service_date ?? null, urgent: !!a.urgent, reminders: a.reminders ?? [],
      });
      if (op.status === "confirmed" && op.result_id) {
        const { data: s } = await db.from("case_deadlines").select("*").eq("id", op.result_id).maybeSingle();
        const row = s && card.rows.find((r) => r.kind === s.kind);
        if (s && row) {
          Object.assign(row, {
            state: "ready", days: s.days, last_day: s.last_day, raw_last_day: s.raw_last_day, moved: s.raw_last_day !== s.last_day,
            review_holidays: !s.holidays_reviewed, days_left: daysBetween(card.today, s.last_day),
          });
          row.article = { ...row.article, ok: true, text: s.article_text, version_id: s.version_id };
          card.basis = s.start_basis as StartBasis;
          card.serviceDate = s.start_basis === "service_date" ? s.start_date : null;
          card.startError = null;
          card.urgent = s.urgent;
          card.reminders = cleanReminders(s.reminders);
        }
      }
      out[p.id] = { card };
    } catch (e) {
      out[p.id] = { error: e instanceof DeadlineError ? e.message : "ماقدرتش أحسب المواعيد دلوقتي" };
    }
  }
  return out;
}
