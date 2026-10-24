// The Word export rendered to images (PR 6b) → screenshots/library/export-*.png (+ the .docx files themselves, to open in Word).
// READ ONLY: the demo case is read through RLS (the REAL fill of a real case), the office's «ورق المكتب» and the lawyer's own template are Word files made in
// code (scripts/word-fixtures.ts: the demo office has not uploaded any), nothing is written to the database or to Storage. The images are macOS Quick Look's
// rendering of each .docx (`qlmanage -t`): a real Word-compatible renderer, not a mock.
//   export-on-office-paper.png   a draft on the office's paper: header with the logo, footer, the office's font and margins
//   export-plain.png             the same draft with no office style yet (a plain A4 page)
//   export-own-template.png      a draft from the lawyer's own Word template: its formatting kept, the values put into it
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/library-docx-shots.ts
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import type { Db } from "@/lib/supabase/server";
import { buildDraft } from "@/lib/library/make";
import { BLANK, buildDocx } from "@/lib/word/build";
import { openDocx } from "@/lib/word/docx";
import { fillDocxTemplate, knownKey, LAWYER_KEYS } from "@/lib/word/template";
import { makeOfficeDocx, makeTemplateDocx } from "./word-fixtures";

const OUT = "screenshots/library";
const TMP = "scripts/out/docx";
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });
const CASE = "72071d66-4ab3-4682-9c3d-1ff65cdc2369";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
const db = sb as unknown as Db;
const { data: t } = await db.from("templates").select("id, slug").is("office_id", null);
const tpl = (slug: string) => t!.find((x) => x.slug === slug)!.id;
// the lawyer asked for the grounds in this one (a mocked wish: the text is typed here), so the export shows a drafted section too
const built = await buildDraft(db, { template: tpl("appeal-sheet"), case: CASE, grounds: "الدفع بعدم قبول الدعوى لرفعها على غير ذي صفة." });
console.log(`${built.title}: filled [${built.fill.filled.map((f) => f.key).join(", ")}] missing [${built.fill.missing.map((m) => m.key).join(", ")}]`);

const render = (file: string, name: string) => {
  execFileSync("qlmanage", ["-t", "-s", "1500", "-o", TMP, file], { stdio: "pipe" });
  const png = readdirSync(TMP).find((f) => f === `${file.split("/").pop()}.png`);
  if (!png) throw new Error(`no render for ${file}`);
  copyFileSync(`${TMP}/${png}`, `${OUT}/${name}.png`);
  copyFileSync(file, `${OUT}/${name}.docx`);
  console.log(`rendered ${name}`);
};

const office = await makeOfficeDocx();
const onOffice = await buildDocx(built.body, { title: built.title, office });
writeFileSync(`${TMP}/export-on-office-paper.docx`, onOffice);
render(`${TMP}/export-on-office-paper.docx`, "export-on-office-paper");

writeFileSync(`${TMP}/export-plain.docx`, await buildDocx(built.body, { title: built.title }));
render(`${TMP}/export-plain.docx`, "export-plain");

const zip = await openDocx(await makeTemplateDocx());
const filled = new Map(built.fill.filled.map((f) => [f.key, f.value]));
const lawyer = new Map(built.body.blocks.flatMap((b) => (b.t === "lawyer" ? [[b.key, b.text.trim()] as const] : [])));
await fillDocxTemplate(zip, (name) => { const k = knownKey(name); return !k ? BLANK : (LAWYER_KEYS as readonly string[]).includes(k) ? lawyer.get(k) || BLANK : filled.get(k) ?? BLANK; }, built.title);
writeFileSync(`${TMP}/export-own-template.docx`, await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
render(`${TMP}/export-own-template.docx`, "export-own-template");
