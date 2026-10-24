// PREVIEW PAGE for scripts/draft-editor-shots.ts (development only: it 404s in production). The draft editor with MOCKED data: the shared database has no
// draft, and the screenshots must not write one. The editor, its tracked changes and its version history are the real components.
//   ?changes=1    two rewordings and one cited article waiting for ✓ / ×
//   ?versions=1   the history has versions (the shots script clicks «النسخ» to open the panel)
//   ?style=0      the office has no paper yet          ?own=1  a draft from the lawyer's own Word template          ?imported=1  a draft opened from a Word file
import { notFound } from "next/navigation";
import { parseBody } from "@/lib/draft/model";
import type { PendingChange } from "@/lib/draft/pending";
import type { VersionRow } from "@/lib/draft/store";
import type { DraftFull } from "@/lib/library/list";
import type { OfficeStyle } from "@/lib/word/office-style";
import { Host } from "./Host";

const DOC = "11111111-1111-4111-8111-111111111111";
// a real demo case (the layout reads it through RLS, read only): the page is under it so the chat beside the paper is that case's
const CASE = "72071d66-4ab3-4682-9c3d-1ff65cdc2369";
const STYLE: OfficeStyle = {
  header: { lines: ["مكتب الأستاذ / تجريبي", "للمحاماة والاستشارات القانونية", "المحامي بالنقض والإدارية العليا"], picture: true },
  footer: { lines: ["12 ش التحرير، الدقي، الجيزة · 0100 000 0000 · office@example.com"], picture: false },
  fonts: { body: "Traditional Arabic", size: 32 }, margins: { top: 1440, bottom: 1440, left: 1440, right: 1440, header: 708, footer: 708 }, page: { w: 11906, h: 16838 },
};

export default async function Page({ searchParams }: { searchParams: Promise<{ style?: string; own?: string; imported?: string; versions?: string; changes?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const quote = "«البيع تم بعقد عرفي مؤرخ 3/2/2021، وأقر البائع بصحة توقيعه عليه»";
  const body = parseBody({
    version: 1,
    blocks: [
      { t: "title", text: "صحيفة استئناف" },
      { t: "p", text: "إنه في يوم … الموافق … بناءً على طلب السيد/ كريم المثالي، ومحله المختار مكتب الأستاذ/ تجريبي المحامي، أنا … محضر محكمة … قد انتقلت وأعلنت السيد/ حسن الافتراضي." },
      { t: "p", text: "محكمة الاستئناف: {{court}} · الدائرة: {{circuit}}" },
      { t: "h", text: "الوقائع" },
      { t: "p", text: "أقام المستأنف الدعوى رقم 8833 لسنة 2024 بطلب الحكم بصحة ونفاذ عقد البيع المؤرخ 3/2/2021، وقد ورد بالصحيفة:", marks: [{ k: "b", s: 13, e: 33 }] },
      { t: "p", text: quote, marks: [{ k: "lock", s: 0, e: quote.length, src: "الصحيفة · ص 2", doc: DOC, page: 2 }] },
      { t: "lawyer", key: "grounds", heading: "أسباب الاستئناف", hint: "يكتبها المحامي", state: "written", text: "السبب الأول: القصور في التسبيب.\nالسبب الثاني: الخطأ في تطبيق القانون." },
      { t: "lawyer", key: "requests", heading: "الطلبات", hint: "يكتبها المحامي", state: "empty", text: "" },
    ],
  });
  const grounds = body.blocks[6].id!;
  const quoteBlock = body.blocks[5].id!;
  const draft: DraftFull = {
    id: "22222222-2222-4222-8222-222222222222", title: "صحيفة استئناف · كريم المثالي", template_name: sp.imported ? "ملف Word" : "صحيفة استئناف", needs_lawyer_review: false,
    created_at: "2026-10-27T09:00:00.000000+00:00", updated_at: "2026-10-27T10:00:00.000000+00:00", open_spots: 1, own_template: !!sp.own, body,
    fill: {
      filled: [{ key: "judgment_text", label: "منطوق الحكم", value: "حكمت المحكمة برفض الدعوى.", source: "الحكم · ص 3" }],
      missing: [{ key: "court", label: "المحكمة", reason: "المحكمة مش متسجلة" }, { key: "circuit", label: "الدائرة", reason: "الدائرة مش متسجلة" }],
      lawyer: [{ key: "grounds", heading: "أسباب الاستئناف", state: "written" }, { key: "requests", heading: "الطلبات", state: "empty" }],
      ...(sp.imported ? { imported: { file_name: "مذكرة قديمة.docx", dropped: ["tables", "images"] as ("tables" | "images")[] } } : {}),
    },
  };
  const now = Date.parse("2026-10-27T10:00:00Z");
  const iso = (m: number) => new Date(now - m * 60_000).toISOString();
  const versions: VersionRow[] = sp.versions ? [
    { id: "v5", kind: "save", note: null, created_at: iso(1), restored_from: null },
    { id: "v4", kind: "accept", note: "ترتيب: ترتيب الأسباب من الأقوى للأضعف", created_at: iso(14), restored_from: null },
    { id: "v3", kind: "save", note: null, created_at: iso(32), restored_from: null },
    { id: "v2", kind: "restore", note: null, created_at: iso(95), restored_from: "v1" },
    { id: "v1", kind: "original", note: null, created_at: iso(240), restored_from: null },
  ] : [];
  const old = parseBody({ version: 1, blocks: [{ t: "title", text: "صحيفة استئناف" }, { t: "p", text: "نسخة قديمة من المسودة." }, { t: "lawyer", key: "grounds", heading: "أسباب الاستئناف", state: "written", text: "السبب الأول: القصور في التسبيب." }] });
  const changes: PendingChange[] = sp.changes ? [
    { proposalId: "p1", opId: "op1", label: "ترتيب", why: "الخطأ في تطبيق القانون بقى السبب الأول، لأنه الأقوى", cite: null,
      args: { kind: "replace", block: grounds, old_text: "السبب الأول: القصور في التسبيب.", new_text: "السبب الأول: الخطأ في تطبيق القانون، إذ أطرح الحكم المستأنف إقرار البائع بالتوقيع ولم يعرض له." } },
    { proposalId: "p1", opId: "op2", label: "صياغة", why: "القصور في التسبيب اتوضح إنه عدم الرد على دفاع جوهري", cite: null,
      args: { kind: "replace", block: grounds, old_text: "السبب الثاني: الخطأ في تطبيق القانون.", new_text: "السبب الثاني: القصور في التسبيب، إذ لم يرد الحكم على دفاع جوهري للمستأنف." } },
    { proposalId: "p1", opId: "op3", label: "إضافة", why: "سند من الحكم", cite: { text: "حيث إن المادة 227 من قانون المرافعات تنص على أن الأحكام تصدر بالأغلبية.", src: "الحكم · ص 3", doc: DOC, page: 3 },
      args: { kind: "add", block: quoteBlock } },
  ] : [];
  return <Host draft={draft} caseId={CASE} style={sp.style === "0" ? null : STYLE} versions={versions} old={old} changes={changes} />;
}
