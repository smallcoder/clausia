/**
 * Edits that the chat proposes, shown on the page and in the card (split layout, PR 2). Pure code, no database, no
 * server-only import: the card (client), the case page (server) and the tests all use it.
 *
 * Nothing is stored here. «Old» is worked out at display time from what is saved NOW (the case row, the hearing, its next
 * hearing): if the data changed since the card was made, the current value is the old one.
 */
import { formatDmy, parseDmy } from "@/lib/dates";
import { CASE_STATUS, DECISION, PARTY_ROLE, STAGE } from "@/lib/labels";
import type { Proposal, ProposalOp } from "@/lib/proposals";

/** An op still waiting for the lawyer (the same rule as the card's own «open»). */
export const isOpenOp = (o: Pick<ProposalOp, "status">) => o.status === "pending" || o.status === "failed";

export interface SavedCase {
  case_number: string | null; case_year: number | null; court: string | null; circuit: string | null; case_type: string | null;
  title: string | null; stage: string; status: string; client_role: string | null; summary: string | null;
  facts_date: string | null; facts_date_precision: string;
}
export interface SavedHearing {
  id: string; hearing_date: string; decision_type: string | null; decision_text: string | null; next_hearing_id: string | null; location?: string | null;
}
/** What the old values are read from. `nextDate`: the date of `hearing`'s next hearing (iso), if it has one. */
export interface Saved { case?: SavedCase | null; hearing?: SavedHearing | null; nextDate?: string | null }

/** One line of an edit: «الجلسة الجاية  22/10/2026 ← 5/12/2026». `old` is null when nothing is saved there. */
export interface EditRow { key: string; label: string; old: string | null; new: string }

/** The ops that change something that already exists (the card shows «old ← new»). The others add a new item. */
export const CHANGE_TOOLS = ["update_case", "record_decision", "set_hearing_location"] as const;
export const isChangeOp = (o: Pick<ProposalOp, "tool">) => (CHANGE_TOOLS as readonly string[]).includes(o.tool);

/** «7» → «الدائرة 7»: the same rule `applyOp` uses when it saves the circuit. */
export function circuitText(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  return /^[0-9٠-٩]+(\s|$)/.test(t) ? `الدائرة ${t}` : t;
}

const str = (v: unknown): string | null => (v === undefined || v === null || v === "" ? null : String(v));
const dateOf = (v: unknown) => { const p = parseDmy(str(v)); return p ? formatDmy(p.iso, p.precision) : str(v); };

const CASE_FIELDS: { key: keyof SavedCase; label: string; show: (v: unknown) => string | null }[] = [
  { key: "title", label: "وصف الدعوى", show: str },
  { key: "case_number", label: "رقم الدعوى", show: str },
  { key: "case_year", label: "السنة", show: str },
  { key: "court", label: "المحكمة", show: str },
  { key: "circuit", label: "الدائرة", show: (v) => circuitText(str(v)) },
  { key: "case_type", label: "النوع", show: str },
  { key: "stage", label: "الدرجة", show: (v) => (v ? STAGE[v as keyof typeof STAGE] ?? String(v) : null) },
  { key: "status", label: "الحالة", show: (v) => (v ? CASE_STATUS[v as keyof typeof CASE_STATUS] ?? String(v) : null) },
  { key: "client_role", label: "صفة موكلنا", show: (v) => (v ? PARTY_ROLE[v as keyof typeof PARTY_ROLE] ?? String(v) : null) },
  { key: "facts_date", label: "تاريخ الوقائع", show: str },
  { key: "summary", label: "ملخص", show: str },
];

/** The lines of one change op: only fields whose new value differs from what is saved now. Add ops have none. */
export function diffRows(op: Pick<ProposalOp, "tool" | "args">, saved: Saved): EditRow[] {
  const a = op.args as Record<string, unknown>;
  if (op.tool === "update_case" && saved.case) {
    const c = saved.case;
    const rows: EditRow[] = [];
    for (const f of CASE_FIELDS) {
      if (a[f.key] === undefined) continue;
      const next = f.key === "facts_date" ? dateOf(a[f.key]) : f.show(a[f.key]);
      const old = f.key === "facts_date" ? (c.facts_date && c.facts_date_precision !== "unknown" ? formatDmy(c.facts_date, c.facts_date_precision as "day") : null) : f.show(c[f.key]);
      if (next && next !== old) rows.push({ key: f.key, label: f.label, old, new: next });
    }
    return rows;
  }
  if (op.tool === "record_decision" && saved.hearing) {
    const h = saved.hearing;
    const rows: EditRow[] = [];
    const nd = str(a.next_date) ? dateOf(a.next_date) : null;
    const oldNext = saved.nextDate ? formatDmy(saved.nextDate) : null;
    if (nd && nd !== oldNext) rows.push({ key: "next_date", label: "الجلسة الجاية", old: oldNext, new: nd });
    const decision = a.decision ? DECISION[a.decision as keyof typeof DECISION] ?? String(a.decision) : null;
    const text = str(a.decision_text);
    if (decision) {
      const old = h.decision_type ? [DECISION[h.decision_type as keyof typeof DECISION] ?? h.decision_type, h.decision_text].filter(Boolean).join(" · ") : null;
      rows.push({ key: "decision", label: `قرار جلسة ${formatDmy(h.hearing_date)}`, old, new: [decision, text].filter(Boolean).join(" · ") });
    }
    const req = str(a.next_requirements);
    if (req) rows.push({ key: "next_requirements", label: "المطلوب للجلسة الجاية", old: null, new: req });
    return rows;
  }
  if (op.tool === "set_hearing_location" && saved.hearing && str(a.location)) {
    const old = saved.hearing.location ?? null;
    return old === a.location ? [] : [{ key: "location", label: "مكان الجلسة", old, new: String(a.location) }];
  }
  return [];
}

/** «تعديل واحد / تعديلين / 3 تعديلات / 11 تعديل» */
export const editsLabel = (n: number) => (n === 1 ? "تعديل واحد" : n === 2 ? "تعديلين" : n <= 10 ? `${n} تعديلات` : `${n} تعديل`);

// ---------- the page: what the case page highlights ----------

/** A new row waiting in a list of the page (the lawyer has not confirmed it yet). */
export interface PendingRow {
  key: string; sortIso: string | null; date: string | null; text: string; kind?: string | null; side?: "ours" | "opponent";
  /** the case tab that shows the row (the timeline mixes them): «الجلسات» for a hearing, «الوقائع» (default) for a fact */
  on?: "hearings" | "facts";
}

export interface PendingEdits {
  /** what «أكّد» on the page confirms: the open ops this page shows, per card */
  groups: { proposalId: string; opIds: string[] }[];
  /** the lines of every change (header cells, hearing card, facts date) + the new rows: what the bar and the card count */
  count: number;
  /** the case row with the proposed fields applied (several cards fold in the order they were made); null = none */
  casePatch: Partial<SavedCase> | null;
  /** the decisions: hearing + the lines to show on the hearing card */
  decisions: { hearingId: string; hearingDate: string; rows: EditRow[] }[];
  /** new rows by list */
  timeline: PendingRow[];
  parties: { key: string; name: string; role: string; ours: boolean }[];
  requests: PendingRow[];
  arguments: PendingRow[];
}

export const EMPTY_EDITS: PendingEdits = { groups: [], count: 0, casePatch: null, decisions: [], timeline: [], parties: [], requests: [], arguments: [] };

/**
 * The ops of `proposals` that belong to this case and are still open, mapped to the places of the page.
 * `hearings`: every hearing of the case (saved + suggested), with its next hearing's date, to find the old values.
 * Only this case: an op counts when its `case` is this case, or its `hearing` is one of this case's hearings.
 */
export function buildPendingEdits(
  caseId: string, saved: { case: SavedCase; hearings: (SavedHearing & { nextDate?: string | null })[] }, proposals: Proposal[],
): PendingEdits {
  const out: PendingEdits = { ...EMPTY_EDITS, groups: [], decisions: [], timeline: [], parties: [], requests: [], arguments: [] };
  let patch: Partial<SavedCase> | null = null;
  for (const p of [...proposals].sort((x, y) => x.created_at.localeCompare(y.created_at))) {
    if (p.status !== "pending" && p.status !== "partially_confirmed") continue;
    const opIds: string[] = [];
    for (const o of p.ops) {
      if (!isOpenOp(o)) continue;
      const a = o.args as Record<string, unknown>;
      const mine = a.case === caseId;
      const hearing = typeof a.hearing === "string" ? saved.hearings.find((h) => h.id === a.hearing) : undefined;
      const key = `${p.id}:${o.op_id}`;
      let shown = 0;
      switch (o.tool) {
        case "update_case": {
          if (!mine) break;
          const rows = diffRows(o, { case: { ...saved.case, ...patch } });
          // fields the page shows: all but «صفة موكلنا», which has no place on it yet
          const onPage = rows.filter((r) => r.key !== "client_role");
          if (!onPage.length) break;
          const merged = { ...(patch ?? {}) } as Record<string, unknown>;
          for (const f of CASE_FIELDS) if (a[f.key] !== undefined) merged[f.key] = f.key === "circuit" ? circuitText(String(a.circuit)) : a[f.key];
          if (a.facts_date !== undefined) { const d = parseDmy(String(a.facts_date)); if (d) { merged.facts_date = d.iso; merged.facts_date_precision = d.precision; } }
          patch = merged as Partial<SavedCase>;
          shown = onPage.length;
          break;
        }
        case "record_decision": {
          if (!hearing) break;
          const rows = diffRows(o, { hearing, nextDate: hearing.nextDate ?? null });
          if (!rows.length) break;
          out.decisions.push({ hearingId: hearing.id, hearingDate: hearing.hearing_date, rows });
          const line = ["القرار:", DECISION[a.decision as keyof typeof DECISION] ?? "", str(a.decision_text), dateOf(a.next_date) && `الجلسة القادمة ${dateOf(a.next_date)}`, str(a.next_requirements) && `المطلوب: ${a.next_requirements}`]
            .filter(Boolean).join(" ");
          out.timeline.push({ key, sortIso: hearing.hearing_date, date: formatDmy(hearing.hearing_date), text: line, kind: "decision", on: "hearings" });
          shown = rows.length;
          break;
        }
        case "add_hearing": {
          if (!mine) break;
          const d = parseDmy(str(a.date));
          if (!d) break;
          out.timeline.push({ key, sortIso: d.iso, date: formatDmy(d.iso), text: ["جلسة", str(a.purpose), str(a.location)].filter(Boolean).join(" · "), on: "hearings" });
          shown = 1;
          break;
        }
        case "add_fact": {
          if (!mine) break;
          const d = parseDmy(str(a.date));
          out.timeline.push({ key, sortIso: d?.iso ?? null, date: str(a.date_text) ?? (d ? formatDmy(d.iso, d.precision) : null), text: String(a.text ?? "") });
          shown = 1;
          break;
        }
        case "add_party": {
          if (!mine) break;
          out.parties.push({ key, name: String(a.name ?? ""), role: PARTY_ROLE[a.role as keyof typeof PARTY_ROLE] ?? String(a.role ?? ""), ours: !!a.is_our_client });
          shown = 1;
          break;
        }
        case "add_request": {
          if (!mine) break;
          out.requests.push({ key, sortIso: null, date: null, text: String(a.text ?? ""), kind: str(a.kind) });
          shown = 1;
          break;
        }
        case "add_argument": {
          if (!mine) break;
          out.arguments.push({ key, sortIso: null, date: null, text: String(a.text ?? ""), kind: str(a.kind), side: a.side === "ours" ? "ours" : "opponent" });
          shown = 1;
          break;
        }
        default:
          break;
      }
      if (shown) { opIds.push(o.op_id); out.count += shown; }
    }
    if (opIds.length) out.groups.push({ proposalId: p.id, opIds });
  }
  out.casePatch = patch;
  return out;
}
