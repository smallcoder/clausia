// GET /api/documents/progress?since=<iso> → the paper this lawyer is uploading right now: pages read so far out of
// the pages being read, then the extraction step; null when nothing is being read. A route, not a server action:
// a page's server actions run one at a time, so a progress action would wait behind the upload itself.
import { MAX_PAGES } from "@/lib/documents/process";
import { createClient } from "@/lib/supabase/server";

export type ReadProgress = { page: number; total: number; phase: "reading" | "extracting" } | null;

export async function GET(req: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const since = new URL(req.url).searchParams.get("since");
  if (!since || Number.isNaN(Date.parse(since))) return Response.json({ error: "since" }, { status: 400 });
  const { data: doc } = await db.from("documents").select("id, page_count, read_status")
    .eq("created_by", user.id).gte("created_at", since).in("read_status", ["pending", "reading", "done"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  let out: ReadProgress = null;
  if (doc) {
    const total = Math.min(doc.page_count ?? 0, MAX_PAGES);
    if (doc.read_status === "done") out = { page: total, total, phase: "extracting" };
    else {
      const { count } = await db.from("document_pages").select("document_id", { count: "exact", head: true }).eq("document_id", doc.id);
      out = { page: Math.min((count ?? 0) + 1, total), total, phase: "reading" };
    }
  }
  return Response.json(out, { headers: { "cache-control": "no-store" } });
}
