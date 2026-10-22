// RLS isolation test: the OTHER lawyer (office B) must not see or change anything of office A (DEMO).
// Also checks DEMO sees its own cases and that getCaseFile works for DEMO and fails for OTHER.
// Prints PASS/FAIL per check; exits 1 on any FAIL. Never prints credentials.
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-rls.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/db/types";
import type { Db } from "../src/lib/supabase/server";
import { getCaseFile } from "../src/lib/case-file";
import { confirmCell, editCell, removeColumn, renameColumn } from "../src/lib/doc-columns/edit";
import { dismissReminder, dueReminders, setBriefReminder, undoReminder } from "../src/lib/brief/reminders";
import { remindInstant } from "../src/lib/brief/time";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function signIn(prefix: "DEMO" | "OTHER") {
  const db = createClient<Database>(URL, KEY, { auth: { persistSession: false } });
  const { error } = await db.auth.signInWithPassword({ email: process.env[`${prefix}_EMAIL`]!, password: process.env[`${prefix}_PASSWORD`]! });
  if (error) throw new Error(`${prefix} sign-in failed: ${error.message}`);
  return db;
}

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const A = await signIn("DEMO");
const B = await signIn("OTHER");

const { data: memA } = await A.from("office_members").select("office_id").single();
const { data: memB } = await B.from("office_members").select("office_id").single();
const officeA = memA!.office_id;
check("offices A and B differ", !!memB && memB.office_id !== officeA);

// ---------- DEMO sees its own data ----------
const { data: aCases } = await A.from("cases").select("id").limit(50);
check("DEMO sees its own cases", (aCases?.length ?? 0) > 0, `${aCases?.length ?? 0} cases`);
const caseId = aCases?.[0]?.id;
const { data: aHearing } = await A.from("hearings").select("id, hearing_date").order("hearing_date", { ascending: false }).limit(1).maybeSingle();
const { data: aDoc } = await A.from("documents").select("id, storage_path").limit(1).maybeSingle();

// ---------- OTHER reads nothing of office A ----------
const TABLES = ["cases", "clients", "case_parties", "case_facts", "case_requests", "case_arguments", "hearings", "judgments", "documents",
  "document_pages", "proposals", "chat_threads", "chat_messages", "llm_calls", "doc_columns", "doc_column_cells", "reminders"] as const;
for (const t of TABLES) {
  const { count: aCount } = await (A as SupabaseClient<Database>).from(t).select("id", { count: "exact", head: true }).eq("office_id", officeA);
  const { data, error } = await (B as SupabaseClient<Database>).from(t).select("id").eq("office_id", officeA).limit(5);
  check(`OTHER reads 0 rows of office A: ${t}`, !error && (data?.length ?? 0) === 0, `A has ${aCount ?? "?"}; B got ${error ? `error ${error.message}` : data?.length}`);
}
if (caseId) {
  const { data } = await B.from("cases").select("id").eq("id", caseId);
  check("OTHER cannot read an office-A case by id", (data?.length ?? 0) === 0);
}
const { data: offA } = await B.from("offices").select("id").eq("id", officeA);
check("OTHER cannot read office A row", (offA?.length ?? 0) === 0);

// ---------- writes ----------
if (caseId) {
  const { data: upd, error: updErr } = await B.from("cases").update({ title: "اختبار اختراق" }).eq("id", caseId).select("id");
  check("OTHER update of office-A case affects 0 rows", (upd?.length ?? 0) === 0, updErr ? `error ${updErr.message}` : `${upd?.length ?? 0} rows`);
  const { data: del, error: delErr } = await B.from("cases").delete().eq("id", caseId).select("id");
  check("OTHER delete of office-A case affects 0 rows", (del?.length ?? 0) === 0, delErr ? `error ${delErr.message}` : `${del?.length ?? 0} rows`);
  const { data: still } = await A.from("cases").select("id").eq("id", caseId);
  check("office-A case still exists after OTHER attempts", (still?.length ?? 0) === 1);
}
{
  const { data, error } = await B.from("cases").insert({ office_id: officeA, title: "اختبار اختراق" }).select("id");
  check("OTHER insert with office A's office_id fails", !!error && !data, error ? error.message : "inserted!");
  if (data?.length) await A.from("cases").delete().in("id", data.map((r) => r.id)); // cleanup if the check failed
}
{
  const { data, error } = await B.from("clients").insert({ office_id: officeA, name: "اختبار اختراق" }).select("id");
  check("OTHER insert of a client into office A fails", !!error && !data, error ? error.message : "inserted!");
  if (data?.length) await A.from("clients").delete().in("id", data.map((r) => r.id));
}

// ---------- the documents table's columns and cells (a temp case of office A; removed again) ----------
{
  const { data: tc } = await A.from("cases").insert({ title: "اختبار-RLS-أعمدة", source_kind: "manual" }).select("id").single();
  if (tc && aDoc) {
    try {
      const { data: col } = await A.from("doc_columns").insert({ case_id: tc.id, question: "اختبار", title: "اختبار" }).select("id, office_id").single();
      const { data: cell } = col ? await A.from("doc_column_cells").insert({ column_id: col.id, document_id: aDoc.id, answer: "إجابة", source_page: 1, source_quote: "اقتباس من الورقة", review_status: "suggested" }).select("id").single() : { data: null };
      check("DEMO writes a column and a cell into its own office", !!col && col.office_id === officeA && !!cell);
      if (col && cell) {
        const { data: r1 } = await B.from("doc_columns").select("id").eq("id", col.id);
        const { data: r2 } = await B.from("doc_column_cells").select("id").eq("id", cell.id);
        check("OTHER cannot read an office-A column or cell by id", (r1?.length ?? 0) === 0 && (r2?.length ?? 0) === 0);
        const { data: u1 } = await B.from("doc_columns").update({ title: "اختراق" }).eq("id", col.id).select("id");
        const { data: u2 } = await B.from("doc_column_cells").update({ note: "اختراق" }).eq("id", cell.id).select("id");
        check("OTHER update of an office-A column / cell affects 0 rows", (u1?.length ?? 0) === 0 && (u2?.length ?? 0) === 0);
        const { data: d1 } = await B.from("doc_column_cells").delete().eq("id", cell.id).select("id");
        const { data: d2 } = await B.from("doc_columns").delete().eq("id", col.id).select("id");
        check("OTHER delete of an office-A column / cell affects 0 rows", (d1?.length ?? 0) === 0 && (d2?.length ?? 0) === 0);
        const { data: still } = await A.from("doc_columns").select("id").eq("id", col.id);
        check("the office-A column still exists after OTHER attempts", (still?.length ?? 0) === 1);
        // the lawyer's own edits (issue #61) go through the same RLS: for the other office the column and the cell are not there
        const bDb = B as unknown as Db;
        const rBoth = [await renameColumn(bDb, col.id, "اختراق"), await editCell(bDb, cell.id, "اختراق"), await confirmCell(bDb, cell.id), await removeColumn(bDb, col.id, true)];
        check("OTHER cannot rename, edit, confirm or remove an office-A column or cell (the edit actions)", rBoth.every((r) => !r.ok));
        const { data: mine } = await A.from("doc_columns").select("title").eq("id", col.id).single();
        const { data: mineCell } = await A.from("doc_column_cells").select("answer, review_status, created_by_kind").eq("id", cell.id).single();
        check("…and nothing of office A changed", mine?.title === "اختبار" && mineCell?.answer === "إجابة" && mineCell.review_status === "suggested" && mineCell.created_by_kind === "lawyer");
        check("DEMO can rename, edit and confirm its own (the same actions)", (await renameColumn(A as unknown as Db, col.id, "عنوان جديد")).ok && (await editCell(A as unknown as Db, cell.id, "إجابة معدلة")).ok && (await confirmCell(A as unknown as Db, cell.id)).ok);

        const { data: i1, error: e1 } = await B.from("doc_columns").insert({ office_id: officeA, case_id: tc.id, question: "اختراق", title: "اختراق" }).select("id");
        check("OTHER insert of a column into office A fails", !!e1 && !i1, e1 ? e1.message : "inserted!");
        const { data: i2, error: e2 } = await B.from("doc_column_cells").insert({ office_id: officeA, column_id: col.id, document_id: aDoc.id, answer: null }).select("id");
        check("OTHER insert of a cell into office A fails", !!e2 && !i2, e2 ? e2.message : "inserted!");
      }
    } finally {
      await A.from("cases").delete().eq("id", tc.id); // its columns and cells go with it
    }
  } else check("office A has a paper to test the documents-table columns with", false);
}

// ---------- the brief's reminders («ذكّرني الصبح 7»): the lawyer's own rows ----------
{
  const aDb = A as unknown as Db;
  const bDb = B as unknown as Db;
  const day = "2099-01-02"; // far ahead: its 07:00 has not come
  const when = remindInstant(day);
  await A.from("reminders").delete().eq("for_date", day); // a leftover of a failed run
  const r = await setBriefReminder(aDb, day);
  check("DEMO saves a reminder for 07:00 Cairo of that day", r.ok && new Date(r.remindAt).getTime() === when.getTime(), r.ok ? r.remindAt : r.error);
  if (r.ok) {
    try {
      const again = await setBriefReminder(aDb, day);
      check("a second tap finds the same reminder (one per day)", again.ok && again.id === r.id);
      check("a reminder whose 07:00 has passed is refused", !(await setBriefReminder(aDb, "2020-01-01")).ok);
      const { data: row } = await A.from("reminders").select("office_id, created_by").eq("id", r.id).single();
      check("the row carries DEMO's office and DEMO as its owner", row?.office_id === officeA && !!row?.created_by);
      const { data: r1 } = await B.from("reminders").select("id").eq("id", r.id);
      check("OTHER cannot read an office-A reminder by id", (r1?.length ?? 0) === 0);
      const { data: u1 } = await B.from("reminders").update({ dismissed_at: new Date().toISOString() }).eq("id", r.id).select("id");
      const { data: d1 } = await B.from("reminders").delete().eq("id", r.id).select("id");
      check("OTHER update / delete of an office-A reminder affects 0 rows", (u1?.length ?? 0) === 0 && (d1?.length ?? 0) === 0);
      check("OTHER cannot dismiss or undo it through the actions", !(await dismissReminder(bDb, r.id)).ok && !(await undoReminder(bDb, r.id)).ok);
      const { data: i1, error: e1 } = await B.from("reminders").insert({ office_id: officeA, kind: "brief", for_date: "2099-01-03", remind_at: when.toISOString() }).select("id");
      check("OTHER insert of a reminder into office A fails", !!e1 && !i1, e1 ? e1.message : "inserted!");
      const { data: i2 } = await B.from("reminders").insert({ created_by: row?.created_by, kind: "brief", for_date: "2099-01-04", remind_at: when.toISOString() }).select("id");
      check("OTHER cannot write a reminder in DEMO's name either", !i2?.length);
      const before = await dueReminders(aDb, new Date(when.getTime() - 60_000));
      const after = await dueReminders(aDb, new Date(when.getTime() + 60_000));
      check("not due a minute before 07:00, due a minute after", !before.some((x) => x.id === r.id) && after.some((x) => x.id === r.id));
      check("OTHER sees no due reminder of DEMO", !(await dueReminders(bDb, new Date(when.getTime() + 60_000))).some((x) => x.id === r.id));
      check("DEMO dismisses it: it stops being due", (await dismissReminder(aDb, r.id)).ok && !(await dueReminders(aDb, new Date(when.getTime() + 60_000))).some((x) => x.id === r.id));
    } finally {
      const undone = await undoReminder(aDb, r.id);
      check("DEMO undoes (deletes) it", undone.ok && ((await A.from("reminders").select("id").eq("id", r.id)).data?.length ?? 0) === 0);
    }
  }
}

// ---------- RPC ----------
if (aHearing) {
  const { error } = await B.rpc("record_hearing_decision", { p_hearing_id: aHearing.id, p_decision: "other", p_decision_text: "اختبار اختراق" });
  check("OTHER record_hearing_decision on office-A hearing fails", !!error, error?.message ?? "succeeded!");
} else check("office A has a hearing to test record_hearing_decision", false);

// ---------- storage ----------
{
  const { data, error } = await B.storage.from("documents").list(officeA, { limit: 10 });
  check("OTHER lists nothing under office A's storage prefix", !!error || (data?.length ?? 0) === 0, error ? error.message : `${data?.length} objects`);
  const path = aDoc?.storage_path ?? `${officeA}/00000000-0000-0000-0000-000000000000/probe.pdf`;
  const { data: dl, error: dlErr } = await B.storage.from("documents").download(path);
  check("OTHER cannot download an office-A object", !!dlErr && !dl, aDoc ? "real object" : "probe path (A has no documents yet)");
  const { error: upErr } = await B.storage.from("documents").upload(`${officeA}/rls-probe/probe.txt`, new Blob(["x"]), { upsert: false });
  check("OTHER cannot upload under office A's prefix", !!upErr, upErr?.message ?? "uploaded!");
}

// ---------- getCaseFile ----------
if (caseId) {
  const file = await getCaseFile(A as unknown as Db, caseId);
  check("DEMO getCaseFile returns the case", file.case.id === caseId && file.schema_version === 1, `${file.facts.length} facts, ${file.hearings.length} hearings, ${file.pending_suggestions.length} pending`);
  const dates = file.facts.map((f) => f.date).filter(Boolean) as string[];
  check("getCaseFile facts are ordered by date", dates.every((d, i) => i === 0 || dates[i - 1] <= d));
  const all = [...file.parties, ...file.facts, ...file.requests, ...file.arguments, ...file.hearings, ...file.judgments];
  check("getCaseFile sections hold no suggested/rejected items", all.every((x) => x.review_status === "confirmed"));
  let otherErr = "";
  try { await getCaseFile(B as unknown as Db, caseId); } catch (e) { otherErr = e instanceof Error ? e.message : String(e); }
  check("OTHER getCaseFile on office-A case fails", /not found/.test(otherErr), otherErr || "returned data!");
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
