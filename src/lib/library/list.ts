import "server-only";
/** Reads for the library page and a case's drafts (PR 6). RLS-bound `db`: the shared base templates, the office's own, and this office's drafts only. A failed read THROWS (no silent empty list). */
import type { Database } from "@/lib/db/types";
import { parseBody } from "@/lib/draft/model";
import type { Db } from "@/lib/supabase/server";
import type { DraftBody, DraftFill } from "./types";

type E = Database["public"]["Enums"];

export interface TemplateRow {
  id: string;
  name: string;
  category: E["template_category"];
  description: string;
  /** the office's own («مكتبك»), not a shared base template */
  office: boolean;
  needs_lawyer_review: boolean;
  /** how many drafts THIS office made from it */
  uses: number;
}

export async function listTemplates(db: Db): Promise<TemplateRow[]> {
  const [t, d] = await Promise.all([
    db.from("templates").select("id, name, category, description, office_id, needs_lawyer_review").order("created_at"),
    db.from("drafts").select("template_id").neq("review_status", "rejected").limit(5000),
  ]);
  if (t.error) throw new Error(`templates: ${t.error.message}`);
  if (d.error) throw new Error(`drafts: ${d.error.message}`);
  const uses = new Map<string, number>();
  for (const x of d.data ?? []) if (x.template_id) uses.set(x.template_id, (uses.get(x.template_id) ?? 0) + 1);
  return (t.data ?? []).map((x) => ({
    id: x.id, name: x.name, category: x.category, description: x.description, office: !!x.office_id,
    needs_lawyer_review: x.needs_lawyer_review, uses: uses.get(x.id) ?? 0,
  }));
}

export interface DraftSummary {
  id: string;
  title: string;
  template_name: string;
  needs_lawyer_review: boolean;
  created_at: string;
  /** how many spots the lawyer still has to fill or write */
  open_spots: number;
}

/** The drafts of one case, newest first (the «المذكرات والأحكام» tab and its count). */
export async function listDrafts(db: Db, caseId: string): Promise<DraftSummary[]> {
  const { data, error } = await db.from("drafts").select("id, title, template_name, needs_lawyer_review, created_at, fill")
    .eq("case_id", caseId).neq("review_status", "rejected").order("created_at", { ascending: false });
  if (error) throw new Error(`drafts: ${error.message}`);
  return (data ?? []).map((x) => {
    const f = x.fill as unknown as Partial<DraftFill>;
    return {
      id: x.id, title: x.title, template_name: x.template_name, needs_lawyer_review: x.needs_lawyer_review, created_at: x.created_at,
      open_spots: (f.missing?.length ?? 0) + (f.lawyer?.filter((l) => l.state === "empty").length ?? 0),
    };
  });
}

/** `own_template`: made from the lawyer's own Word template (its file keeps its formatting; the office paper does not apply) */
export interface DraftFull extends DraftSummary { body: DraftBody; fill: DraftFill; own_template: boolean; /** the editor's save names it, so a save over somebody else's change is refused */ updated_at: string }

/** One draft of this case (null when it is not here or not visible). The body is checked (PR 7): a body of the wrong shape is a fault, not something to draw. */
export async function getDraft(db: Db, caseId: string, id: string): Promise<DraftFull | null> {
  const { data, error } = await db.from("drafts").select("id, title, template_name, needs_lawyer_review, created_at, updated_at, body, fill, template_id")
    .eq("case_id", caseId).eq("id", id).neq("review_status", "rejected").maybeSingle();
  if (error) throw new Error(`drafts: ${error.message}`);
  if (!data) return null;
  const body = parseBody(data.body);
  const fill = data.fill as unknown as DraftFill;
  const own = data.template_id ? (await db.from("templates").select("storage_path").eq("id", data.template_id).maybeSingle()).data?.storage_path : null;
  return {
    own_template: !!own, updated_at: data.updated_at,
    id: data.id, title: data.title, template_name: data.template_name, needs_lawyer_review: data.needs_lawyer_review, created_at: data.created_at, body, fill,
    open_spots: (fill.missing?.length ?? 0) + (fill.lawyer?.filter((l) => l.state === "empty").length ?? 0),
  };
}

