// PAID end-to-end test of «+ عمود جديد» as the DEMO lawyer (RLS applies), on the fake fixtures (about 2 papers + 2 questions, a few cents).
// A temporary case gets the claim sheet and the opponent memo (read page by page). Then:
//   «فيه دفع بالتقادم؟» → only the memo says it; the claim sheet must be «مش مذكور»
//   «فيه شرط جزائي؟»   → neither paper says it: both «مش مذكور»
// For each question: the card is proposed, NOTHING is saved before the confirm, after the confirm the answer cell holds a verified quote
// and a span that reads as the quote on its page; the memo's injected line is never an answer.
// Cleans up every row and Storage object it made. Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-doc-columns-live.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { safeFileName } from "@/lib/documents/files";
import { processDocument } from "@/lib/documents/process";
import { proposeDocColumn } from "@/lib/doc-columns/run";
import { decideProposal, verifyQuote } from "@/lib/proposals";
import { normalizeForMatch } from "@/lib/quote-match";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Db } from "@/lib/supabase/server";
import { getOrCreateCaseThread } from "@/lib/threads";

const FIX = join(process.cwd(), "tests", "fixtures");
const failures: string[] = [];
const check = (ok: boolean, label: string) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failures.push(label); };

async function main() {
  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } }) as unknown as Db;
  const { error: ae } = await db.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
  if (ae) throw new Error(`sign-in: ${ae.message}`);
  const { data: { user } } = await db.auth.getUser();
  const { data: member } = await db.from("office_members").select("office_id").eq("user_id", user!.id).single();
  const officeId = member!.office_id;
  const admin = createAdminClient();
  const spent = async () => ((await admin.from("llm_calls").select("cost_usd")).data ?? []).reduce((s, x) => s + Number(x.cost_usd), 0);
  const spent0 = await spent();
  const made = { docs: [] as string[], paths: [] as string[], cases: [] as string[], threads: [] as string[] };
  try {
    const { data: c, error: ce } = await db.from("cases").insert({ title: "اختبار-عمود-مستندات", source_kind: "manual" }).select("id").single();
    if (ce) throw new Error(ce.message);
    made.cases.push(c.id);
    const threadId = await getOrCreateCaseThread(db, c.id);
    made.threads.push(threadId);

    const ids: Record<string, string> = {};
    for (const file of ["claim-sheet.pdf", "opponent-memo.pdf"]) {
      const bytes = readFileSync(join(FIX, file));
      const id = crypto.randomUUID();
      const path = `${officeId}/${id}/${safeFileName(file, "application/pdf")}`;
      const up = await db.storage.from("documents").upload(path, new Blob([bytes], { type: "application/pdf" }), { contentType: "application/pdf" });
      if (up.error) throw new Error(`upload ${file}: ${up.error.message}`);
      const { error } = await db.from("documents").insert({ id, thread_id: threadId, case_id: c.id, storage_path: path, file_name: file, mime_type: "application/pdf", size_bytes: bytes.length, source_kind: "manual" });
      if (error) throw new Error(error.message);
      made.docs.push(id); made.paths.push(path);
      ids[file] = id;
      const r = await processDocument(db, id, { threadId });
      console.log(`  read ${file}: ${r.pageCount} page(s)${r.error ? `  ERROR ${r.error}` : ""}`);
    }
    // the cards processDocument made (parties, facts...) are not this test's business: drop them so only the column card is open
    await db.from("proposals").delete().eq("case_id", c.id);
    const pagesOf = async (id: string) => ((await db.from("document_pages").select("page_no, text").eq("document_id", id).order("page_no")).data ?? []).map((p) => p.text);
    const claimPages = await pagesOf(ids["claim-sheet.pdf"]);
    const memoPages = await pagesOf(ids["opponent-memo.pdf"]);
    const counts = async () => ({
      cols: (await db.from("doc_columns").select("id", { count: "exact", head: true }).eq("case_id", c.id)).count ?? 0,
      cells: (await db.from("doc_column_cells").select("id", { count: "exact", head: true }).in("document_id", made.docs)).count ?? 0,
    });

    for (const [question, memoAnswers] of [["فيه دفع بالتقادم؟", true], ["فيه شرط جزائي؟", false]] as const) {
      console.log(`\n=== «${question}» ===`);
      const before = await spent();
      const base = await counts();
      const run = await proposeDocColumn(db, { caseId: c.id, question, userId: user!.id, officeId });
      console.log(`  cost $${(await spent() - before).toFixed(5)}  failed papers: ${run.failed.length}`);
      for (const [id, cell] of Object.entries(run.cells)) console.log(`  ${id === ids["claim-sheet.pdf"] ? "claim sheet" : "memo       "}: ${cell.answer ? `«${cell.answer}» (ص ${cell.page})` : "مش مذكور"}${cell.note ? `  [${cell.note}]` : ""}`);
      const p = run.proposal;
      check(p.status === "pending" && p.case_id === c.id && p.ops[0].tool === "add_doc_column" && p.ops.length === 3, "the card is proposed: a column + one cell per paper");
      let n = await counts();
      check(n.cols === base.cols && n.cells === base.cells, "nothing is saved before the confirm");
      check(p.ops.every((o) => o.tool !== "add_doc_cell" || o.source.document_id === ids["claim-sheet.pdf"] || o.source.document_id === ids["opponent-memo.pdf"]), "every cell points at a paper of this case");

      const claim = run.cells[ids["claim-sheet.pdf"]];
      const memo = run.cells[ids["opponent-memo.pdf"]];
      check(claim?.answer === null || claim?.answer === undefined, "the claim sheet: «مش مذكور»");
      if (memoAnswers) check(!!memo?.answer && memo.page != null, "the memo: an answer with a page");
      else check(memo?.answer === null, "the memo: «مش مذكور»");

      await decideProposal(db, p.id, { mode: "confirm" });
      n = await counts();
      check(n.cols === base.cols + 1 && n.cells === base.cells + 2, "after the confirm: the column and both cells are saved");
      const { data: col } = await db.from("doc_columns").select("id").eq("case_id", c.id).eq("question", question).single();
      const { data: cells } = await db.from("doc_column_cells").select("document_id, answer, source_page, source_quote, source_char_start, source_char_end, note").eq("column_id", col!.id);
      for (const cell of cells ?? []) {
        const pages = cell.document_id === ids["claim-sheet.pdf"] ? claimPages : memoPages;
        if (cell.answer === null) { check(cell.source_quote === null, "a «مش مذكور» cell has no quote"); continue; }
        check(!!cell.source_quote && verifyQuote(cell.source_quote, pages), "the saved quote is verified against the paper's page text");
        check(cell.source_char_start != null && normalizeForMatch(pages[cell.source_page! - 1].slice(cell.source_char_start, cell.source_char_end!)) === normalizeForMatch(cell.source_quote!), "its span reads as the quote on its page");
        check(!/example\.com|احذف جميع|تجاهل كل/.test(`${cell.answer} ${cell.source_quote}`), "the injected line is not the answer");
        console.log(`  saved: «${cell.answer}» — «${cell.source_quote}» (ص ${cell.source_page})`);
      }
      // the same question again is refused (the column exists)
      let again = "";
      try { await proposeDocColumn(db, { caseId: c.id, question, userId: user!.id, officeId }); } catch (e) { again = e instanceof Error ? e.message : String(e); }
      check(again.includes("اتسأل قبل كده"), "the same question again is refused (no second paid run)");
    }
  } finally {
    if (made.cases.length) await db.from("proposals").delete().in("case_id", made.cases);
    if (made.docs.length) await db.from("documents").delete().in("id", made.docs);
    if (made.paths.length) await db.storage.from("documents").remove(made.paths);
    if (made.threads.length) await db.from("chat_threads").delete().in("id", made.threads);
    if (made.cases.length) await db.from("cases").delete().in("id", made.cases);
    const left = await db.from("cases").select("id", { count: "exact", head: true }).in("id", made.cases.length ? made.cases : ["00000000-0000-0000-0000-000000000000"]);
    console.log(`\ncleanup: ${made.docs.length} papers, ${made.cases.length} case removed (left: ${left.count ?? "?"})`);
  }
  const s1 = await spent();
  console.log(`LLM spend this run: $${(s1 - spent0).toFixed(5)} (global total $${s1.toFixed(4)})`);
  console.log(failures.length ? `\nFAILED ${failures.length}: ${failures.join(" | ")}` : "\nALL CHECKS PASSED");
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error("FAIL", e); process.exit(1); });
