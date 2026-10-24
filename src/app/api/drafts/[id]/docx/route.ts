// «تنزيل Word»: the Word file of one draft (PR 6b). RLS-bound client: another office's draft (or a made-up id) is simply not found → 404.
// The first time (the office has no «ورق المكتب» yet, and the draft is not from the lawyer's own Word template) the lawyer is sent to the draft page where the
// app asks him to upload any Word file from his work; `?plain=1` skips that and downloads on a plain page. Nothing is written.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DocxError } from "@/lib/word/docx";
import { DOCX_MIME } from "@/lib/word/build";
import { exportDraft, loadOfficeStyle } from "@/lib/word/export";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const db = await createClient();
  try {
    if (req.nextUrl.searchParams.get("plain") !== "1" && !(await loadOfficeStyle(db))) {
      const { data: d } = await db.from("drafts").select("case_id, template_id").eq("id", id).maybeSingle();
      if (!d) return NextResponse.json({ error: "not found" }, { status: 404 });
      const own = d.template_id ? (await db.from("templates").select("storage_path").eq("id", d.template_id).maybeSingle()).data?.storage_path : null;
      if (!own) return NextResponse.redirect(new URL(`/cases/${d.case_id}?tab=memos&draft=${id}&word=1`, req.url), { status: 302, headers: { "cache-control": "no-store" } });
    }
    const out = await exportDraft(db, id);
    if (!out) return NextResponse.json({ error: "not found" }, { status: 404 });
    // an ASCII name for old clients, the real (Arabic) name in filename*
    const name = `${out.title.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "draft"}.docx`;
    return new NextResponse(new Blob([out.bytes as BlobPart], { type: DOCX_MIME }), {
      headers: {
        "content-type": DOCX_MIME,
        "content-disposition": `attachment; filename="draft.docx"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof DocxError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error(`[drafts] docx of ${id}: ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.json({ error: "تعذر تجهيز الملف" }, { status: 500 });
  }
}
