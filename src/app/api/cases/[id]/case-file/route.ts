// GET /api/cases/[id]/case-file → the whole case as JSON (getCaseFile). RLS-bound client: another office's case is a 404.
// ?download → served as an attachment.
import { getCaseFile } from "@/lib/case-file";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const file = await getCaseFile(db, id);
    const download = new URL(req.url).searchParams.has("download");
    return Response.json(file, {
      headers: download ? { "Content-Disposition": `attachment; filename="case-${id}.json"` } : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const notFound = /not found|invalid input syntax/.test(msg);
    return Response.json({ error: notFound ? "case not found" : msg }, { status: notFound ? 404 : 500 });
  }
}
