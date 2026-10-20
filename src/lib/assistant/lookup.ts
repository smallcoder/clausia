import "server-only";
/** uuid → display name for the ids that appear in confirmation cards (cheap: one query per table). */
import { formatDmy } from "@/lib/dates";
import { caseLabel } from "@/lib/labels";
import type { Proposal } from "@/lib/proposals";
import type { Db } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF_KEYS: Record<string, "cases" | "clients" | "hearings" | "documents"> = {
  case: "cases", previous_stage_case: "cases", client: "clients", hearing: "hearings", document: "documents",
};

export async function buildProposalLookup(db: Db, proposals: Proposal[]): Promise<Record<string, string>> {
  const ids = { cases: new Set<string>(), clients: new Set<string>(), hearings: new Set<string>(), documents: new Set<string>() };
  for (const p of proposals) {
    for (const o of p.ops) {
      for (const [k, t] of Object.entries(REF_KEYS)) {
        const v = o.args[k];
        if (typeof v === "string" && UUID.test(v)) ids[t].add(v);
      }
      if (o.source.document_id) ids.documents.add(o.source.document_id);
    }
  }
  const out: Record<string, string> = {};
  const [cases, clients, hearings, docs] = await Promise.all([
    ids.cases.size ? db.from("cases").select("id, case_number, case_year, title").in("id", [...ids.cases]).then((r) => r.data ?? []) : [],
    ids.clients.size ? db.from("clients").select("id, name").in("id", [...ids.clients]).then((r) => r.data ?? []) : [],
    ids.hearings.size ? db.from("hearings").select("id, hearing_date").in("id", [...ids.hearings]).then((r) => r.data ?? []) : [],
    ids.documents.size ? db.from("documents").select("id, file_name, title").in("id", [...ids.documents]).then((r) => r.data ?? []) : [],
  ]);
  for (const c of cases) out[c.id] = caseLabel(c);
  for (const c of clients) out[c.id] = c.name;
  for (const h of hearings) out[h.id] = `جلسة ${formatDmy(h.hearing_date)}`;
  for (const d of docs) out[d.id] = d.title || d.file_name;
  return out;
}
