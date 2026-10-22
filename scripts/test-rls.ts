// RLS isolation test: the OTHER lawyer (office B) must not see or change anything of office A (DEMO).
// Also checks DEMO sees its own cases and that getCaseFile works for DEMO and fails for OTHER.
// Prints PASS/FAIL per check; exits 1 on any FAIL. Never prints credentials.
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-rls.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/db/types";
import type { Db } from "../src/lib/supabase/server";
import { getCaseFile } from "../src/lib/case-file";
import { confirmCell, editCell, removeColumn, renameColumn } from "../src/lib/doc-columns/edit";

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
  "document_pages", "proposals", "chat_threads", "chat_messages", "llm_calls", "doc_columns", "doc_column_cells", "case_deadlines", "holiday_reports"] as const;
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

// ---------- appeal deadlines: the admin, the shared holidays, the reports, and the office table ----------
{
  const uidA = (await A.auth.getUser()).data.user!.id;
  const uidB = (await B.auth.getUser()).data.user!.id;
  const { data: isA } = await A.rpc("is_admin");
  const { data: isB } = await B.rpc("is_admin");
  check("is_admin(): DEMO (the owner) is an admin, OTHER is not", isA === true && isB === false);

  // app_admins: no one can read or write it from the app (not even an admin)
  for (const [name, C, uid] of [["DEMO", A, uidA], ["OTHER", B, uidB]] as const) {
    const ins = await C.from("app_admins").insert({ user_id: uid }).select("user_id");
    check(`${name} cannot insert into app_admins`, !ins.data?.length && !!ins.error, ins.error?.message ?? "inserted!");
    const rd = await C.from("app_admins").select("user_id");
    check(`${name} cannot read app_admins`, !!rd.error || !rd.data?.length, rd.error?.message ?? `${rd.data?.length} rows`);
    const up = await C.from("app_admins").update({ created_at: new Date().toISOString() }).eq("user_id", uidA).select("user_id");
    const dl = await C.from("app_admins").delete().eq("user_id", uidA).select("user_id");
    check(`${name} cannot update or delete app_admins`, !up.data?.length && !dl.data?.length, `${up.data?.length ?? up.error?.message} / ${dl.data?.length ?? dl.error?.message}`);
  }
  check("the owner is still an admin after those attempts", (await A.rpc("is_admin")).data === true);

  // holidays: every user reads, only an admin writes
  const { count: hCount } = await B.from("holidays").select("id", { count: "exact", head: true });
  check("OTHER reads the shared holidays", (hCount ?? 0) > 0, `${hCount} rows`);
  const hi = await B.from("holidays").insert({ holiday_date: "2099-01-01", name: "اختبار اختراق", status: "approved" }).select("id");
  check("OTHER (not an admin) cannot insert a holiday", !hi.data?.length && !!hi.error, hi.error?.message ?? "inserted!");
  const { data: someH } = await A.from("holidays").select("id, name, status").limit(1).single();
  const hu = await B.from("holidays").update({ status: "approved", name: "اختبار اختراق" }).eq("id", someH!.id).select("id");
  const hd = await B.from("holidays").delete().eq("id", someH!.id).select("id");
  const { data: hAfter } = await A.from("holidays").select("id, name, status").eq("id", someH!.id).single();
  check("OTHER cannot update or delete a holiday (0 rows) and it is unchanged", !hu.data?.length && !hd.data?.length && hAfter?.name === someH!.name && hAfter?.status === someH!.status);
  const ha = await A.from("holidays").insert({ holiday_date: "2099-01-01", name: "اختبار", status: "draft" }).select("id").single();
  check("DEMO (admin) can insert a holiday", !ha.error && !!ha.data, ha.error?.message ?? "");
  if (ha.data) {
    const hb = await B.from("holidays").update({ status: "approved" }).eq("id", ha.data.id).select("id");
    check("OTHER cannot approve a draft holiday", !hb.data?.length);
    const ap = await A.from("holidays").update({ status: "approved" }).eq("id", ha.data.id).select("id");
    check("DEMO (admin) can approve it", !!ap.data?.length);
    await A.from("holidays").delete().eq("id", ha.data.id);
  }

  // holiday_reports: an office inserts its own pending report and reads its own; only an admin decides
  const rb = await B.from("holiday_reports").insert({ holiday_date: "2099-02-02", name: "اختبار بلاغ B", note: "x" }).select("id, office_id, status").single();
  check("OTHER can report a missing holiday (pending, its own office)", !rb.error && rb.data?.status === "pending" && rb.data.office_id === memB!.office_id, rb.error?.message ?? "");
  const bad1 = await B.from("holiday_reports").insert({ office_id: officeA, holiday_date: "2099-02-02", name: "اختراق" }).select("id");
  const bad2 = await B.from("holiday_reports").insert({ holiday_date: "2099-02-02", name: "اختراق", status: "approved" }).select("id");
  check("OTHER cannot report into office A, nor insert an already-approved report", !!bad1.error && !bad1.data && !!bad2.error && !bad2.data, `${bad1.error?.message} / ${bad2.error?.message}`);
  const ra = await A.from("holiday_reports").insert({ holiday_date: "2099-03-03", name: "اختبار بلاغ A" }).select("id").single();
  if (rb.data && ra.data) {
    const seen = await B.from("holiday_reports").select("id").in("id", [rb.data.id, ra.data.id]);
    check("OTHER reads only its own report, not office A's", seen.data?.length === 1 && seen.data[0].id === rb.data.id);
    const self = await B.from("holiday_reports").update({ status: "approved" }).eq("id", rb.data.id).select("id");
    const { data: still } = await B.from("holiday_reports").select("status").eq("id", rb.data.id).single();
    check("OTHER cannot approve its own report", !self.data?.length && still?.status === "pending");
    const adminSees = await A.from("holiday_reports").select("id").in("id", [rb.data.id, ra.data.id]);
    check("DEMO (admin) reads every office's reports", adminSees.data?.length === 2);
    const adminOk = await A.from("holiday_reports").update({ status: "rejected" }).eq("id", rb.data.id).select("id");
    check("DEMO (admin) can decide a report", !!adminOk.data?.length);
    const w = await B.from("holiday_reports").delete().eq("id", rb.data.id).select("id");
    check("a decided report can no longer be withdrawn", !w.data?.length);
    await A.from("holiday_reports").delete().eq("id", ra.data.id); // office A's own pending one
    await A.from("holiday_reports").update({ status: "pending" }).eq("id", rb.data.id); // admin puts it back so it can be removed by its office
    await B.from("holiday_reports").delete().eq("id", rb.data.id);
  }

  // case_deadlines: office-A rows are invisible and untouchable for OTHER
  const { data: tc2 } = await A.from("cases").insert({ title: "اختبار-RLS-مواعيد", source_kind: "manual" }).select("id").single();
  if (tc2) {
    try {
      const { data: jd } = await A.from("judgments").insert({ case_id: tc2.id, judgment_date: "2026-10-20", operative_text: "اختبار", source_kind: "manual" }).select("id").single();
      const row = { case_id: tc2.id, judgment_id: jd!.id, kind: "appeal", start_date: "2026-10-20", start_basis: "judgment_date", days: 40, raw_last_day: "2026-11-29", last_day: "2026-11-29", law_source_id: "0c84df2b-9239-41b2-a801-8eb176c90985", article_number: "227", version_id: "8a0e094d-18c8-4636-9e9f-0b80187f0826", article_sha256: "x", article_text: "x", reminders: [7, 1] };
      const { data: dd, error: de } = await A.from("case_deadlines").insert(row).select("id").single();
      check("DEMO can save a deadline in its own office", !de && !!dd, de?.message ?? "");
      if (dd) {
        const rd = await B.from("case_deadlines").select("id").eq("id", dd.id);
        const up = await B.from("case_deadlines").update({ last_day: "2030-01-01" }).eq("id", dd.id).select("id");
        const dl = await B.from("case_deadlines").delete().eq("id", dd.id).select("id");
        const { data: kept } = await A.from("case_deadlines").select("last_day").eq("id", dd.id).single();
        check("OTHER cannot read, update or delete an office-A deadline", !rd.data?.length && !up.data?.length && !dl.data?.length && kept?.last_day === "2026-11-29");
        const bi = await B.from("case_deadlines").insert({ ...row, office_id: officeA }).select("id");
        check("OTHER insert of a deadline into office A fails", !!bi.error && !bi.data, bi.error?.message ?? "inserted!");
        const bad = await A.from("case_deadlines").insert({ ...row, kind: "cassation", reminders: [0] }).select("id");
        check("a reminder of 0 days is refused by the table", !!bad.error && !bad.data);
      }
    } finally {
      await A.from("cases").delete().eq("id", tc2.id); // its judgments and deadlines go with it
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
