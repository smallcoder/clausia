// Open / download one document through a short-lived signed URL. RLS-bound client: another office's
// document (or a made-up id) is simply not found → 404.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const db = await createClient();
  const { data: doc } = await db.from("documents").select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const download = req.nextUrl.searchParams.get("download") === "1";
  const { data, error } = await db.storage.from("documents").createSignedUrl(doc.storage_path, 60, download ? { download: doc.file_name } : undefined);
  if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "cache-control": "no-store" } });
}
