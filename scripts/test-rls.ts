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
import { todayIso } from "../src/lib/dates";
import { createThread, moveThreadToCase } from "../src/lib/threads";
import { createProposal, decideProposal } from "../src/lib/proposals";
import { undoConfirm } from "../src/lib/undo";
import { loadCardRows, loadPendingEdits } from "../src/lib/pending-edits";

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

// the service key only cleans up the test's own rows (a dismissal cannot be taken back through the API on purpose)
const admin = createClient<Database>(URL, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
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
  "document_pages", "proposals", "chat_threads", "chat_messages", "llm_calls", "doc_columns", "doc_column_cells", "case_deadlines", "holiday_reports", "reminders", "daily_briefs", "dismissed_notices"] as const;
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

// ---------- Home's morning brief (cached once per day) and «تجاهل» (per lawyer) ----------
{
  const aId = (await A.auth.getUser()).data.user!.id;
  const bId = (await B.auth.getUser()).data.user!.id;
  const day = "2099-02-01";
  const payload = { v: 1, forDate: day, builtAt: new Date().toISOString(), sentences: [], empty: true, cases: 0, newDocs: 0 };
  await A.from("daily_briefs").delete().eq("for_date", day);
  await A.from("daily_briefs").upsert({ user_id: aId, for_date: day, payload }, { onConflict: "user_id,for_date", ignoreDuplicates: true });
  const { data: mine } = await A.from("daily_briefs").select("id, office_id, user_id").eq("for_date", day).maybeSingle();
  check("DEMO saves its brief of a day (its office, its user)", mine?.office_id === officeA && mine?.user_id === aId);
  await A.from("daily_briefs").upsert({ user_id: aId, for_date: day, payload: { ...payload, cases: 99 } }, { onConflict: "user_id,for_date", ignoreDuplicates: true });
  const { data: rows } = await A.from("daily_briefs").select("payload").eq("for_date", day);
  check("one brief per lawyer per day: a second save keeps the first", rows?.length === 1 && (rows[0].payload as { cases: number }).cases === 0);
  const { data: b1 } = await B.from("daily_briefs").select("id").eq("for_date", day);
  check("OTHER cannot read DEMO's brief", (b1?.length ?? 0) === 0);
  const { data: b2 } = await B.from("daily_briefs").delete().eq("for_date", day).select("id");
  check("OTHER cannot delete it", (b2?.length ?? 0) === 0);
  const { error: b3 } = await B.from("daily_briefs").insert({ office_id: officeA, user_id: bId, for_date: "2099-02-02", payload });
  check("OTHER cannot save a brief into office A", !!b3, b3 ? b3.message : "inserted!");
  const { error: b4 } = await B.from("daily_briefs").insert({ user_id: aId, for_date: "2099-02-03", payload });
  check("OTHER cannot save a brief in DEMO's name", !!b4, b4 ? b4.message : "inserted!");
  const { error: b5 } = await A.from("daily_briefs").insert({ user_id: bId, for_date: "2099-02-04", payload });
  check("DEMO cannot save a brief in OTHER's name", !!b5, b5 ? b5.message : "inserted!");
  await A.from("daily_briefs").delete().eq("for_date", day);

  // the real loader: built once, then read; another lawyer's day is their own
  const todayCairo = () => todayIso();
  const { loadMorning } = await import("../src/lib/morning/load");
  const keep = (await A.from("daily_briefs").select("payload").eq("user_id", aId).eq("for_date", todayCairo())).data?.[0];
  await A.from("daily_briefs").delete().eq("user_id", aId).eq("for_date", todayCairo());
  const m1 = await loadMorning(A as unknown as Db, aId, "أ. تجريبي");
  const m2 = await loadMorning(A as unknown as Db, aId, "أ. تجريبي");
  const { data: todays } = await A.from("daily_briefs").select("id").eq("user_id", aId).eq("for_date", todayCairo());
  check("loadMorning: built on the first load, read on the next (one row, the same time)", todays?.length === 1 && m1.brief.builtAt === m2.brief.builtAt);
  const mb = await loadMorning(B as unknown as Db, bId, "أ. آخر");
  const { data: bRows } = await B.from("daily_briefs").select("user_id").eq("for_date", todayCairo());
  check("OTHER's brief is its own (one row, its user) and DEMO's is untouched", bRows?.length === 1 && bRows[0].user_id === bId && ((await A.from("daily_briefs").select("user_id").eq("for_date", todayCairo())).data ?? []).every((r) => r.user_id === aId));
  check("OTHER's cards and brief name nothing of office A", !JSON.stringify([mb.notices, mb.brief]).includes(officeA) && mb.notices.every((n) => n.kind !== "hearing_decision" || n.hearing.case.id !== caseId));
  await B.from("daily_briefs").delete().eq("user_id", bId).eq("for_date", todayCairo());
  await A.from("daily_briefs").delete().eq("user_id", aId).eq("for_date", todayCairo());
  if (keep) await A.from("daily_briefs").insert({ user_id: aId, for_date: todayCairo(), payload: keep.payload });

  // «تجاهل»: saved per lawyer
  const key = "00000000-0000-4000-8000-0000000000aa";
  await admin.from("dismissed_notices").delete().eq("key", key);
  const { error: d0 } = await A.from("dismissed_notices").insert({ user_id: aId, kind: "hearing_decision", key });
  check("DEMO dismisses a card (saved)", !d0, d0?.message);
  const { error: dDup } = await A.from("dismissed_notices").insert({ user_id: aId, kind: "hearing_decision", key });
  check("dismissing it twice is one row (unique per lawyer, kind and key)", !!dDup);
  const { data: dA } = await A.from("dismissed_notices").select("key").eq("key", key);
  const { data: dB } = await B.from("dismissed_notices").select("key").eq("key", key);
  check("DEMO sees its dismissal, OTHER sees none", dA?.length === 1 && (dB?.length ?? 0) === 0);
  const { error: dB2 } = await B.from("dismissed_notices").insert({ user_id: bId, kind: "hearing_decision", key });
  const { data: dB3 } = await B.from("dismissed_notices").select("key").eq("key", key);
  check("OTHER dismissing the same key is its own row: it does not touch DEMO's", !dB2 && dB3?.length === 1 && ((await A.from("dismissed_notices").select("user_id").eq("key", key)).data ?? []).length === 1);
  const { error: dX1 } = await B.from("dismissed_notices").insert({ office_id: officeA, user_id: bId, kind: "date_conflict", key: "x:y" });
  const { error: dX2 } = await B.from("dismissed_notices").insert({ user_id: aId, kind: "date_conflict", key: "x:z" });
  const { error: dX3 } = await A.from("dismissed_notices").insert({ user_id: bId, kind: "date_conflict", key: "x:w" });
  check("nobody can dismiss into another office or in another lawyer's name", !!dX1 && !!dX2 && !!dX3);
  const { data: dU } = await A.from("dismissed_notices").update({ kind: "date_conflict" }).eq("key", key).select("id");
  const { data: dD } = await A.from("dismissed_notices").delete().eq("key", key).select("id");
  check("a dismissal cannot be changed or taken back through the API (it never comes back)", (dU?.length ?? 0) === 0 && (dD?.length ?? 0) === 0);
  await admin.from("dismissed_notices").delete().eq("key", key);
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

const rows = (r: { data: { id: string }[] | null }) => r.data ?? [];
// ---------- chat sessions: hearing_id and «move to a case» (chat-first split layout) ----------
{
  const { data: ownCases } = await A.from("cases").select("id").limit(2);
  const caseA2 = ownCases?.find((x) => x.id !== caseId)?.id;
  const { data: hOther } = caseA2 ? await A.from("hearings").select("id").eq("case_id", caseA2).limit(1).maybeSingle() : { data: null };
  const { data: tA } = await A.from("chat_threads").insert({ title: "اختبار-rls: محادثة عامة" }).select("id").single();
  const { data: tB } = await B.from("chat_threads").insert({ title: "اختبار-rls: محادثة B" }).select("id").single();
  const madeA: string[] = [], madeB: string[] = [];
  if (tA) madeA.push(tA.id);
  if (tB) madeB.push(tB.id);
  try {
    if (tA && caseId && aHearing) {
      // the hearing link: A can link a session of its own case to that case's hearing
      const { data: hs } = await A.from("hearings").select("id, case_id").eq("id", aHearing.id).single();
      const { data: ok, error: okErr } = await A.from("chat_threads").insert({ case_id: hs!.case_id, hearing_id: hs!.id, title: "اختبار-rls: جلسة" }).select("id").single();
      if (ok) madeA.push(ok.id);
      check("A links a session to a hearing of its own case", !!ok && !okErr, okErr?.message);
      const { data: seen } = await B.from("chat_threads").select("id").eq("hearing_id", hs!.id);
      check("OTHER reads 0 sessions by an office-A hearing_id", (seen?.length ?? 0) === 0);
      const { data: mine } = await A.from("chat_threads").select("id").eq("hearing_id", hs!.id);
      check("…while A sees it", (mine?.length ?? 0) >= 1);

      // OTHER cannot touch A's session
      const { data: up } = await B.from("chat_threads").update({ case_id: null, title: "اختراق" }).eq("id", tA.id).select("id");
      check("OTHER update of an office-A session affects 0 rows", (up?.length ?? 0) === 0);
      const { data: moved } = await B.from("chat_threads").update({ case_id: caseId }).eq("id", tA.id).select("id");
      check("OTHER cannot move an office-A session to a case", (moved?.length ?? 0) === 0);

      // OTHER cannot point its own session at office A's case or hearing (a foreign key alone would accept the id)
      const e1 = await B.from("chat_threads").insert({ case_id: caseId, title: "اختراق" }).select("id");
      madeB.push(...rows(e1).map((r) => r.id));
      check("OTHER cannot create a session on an office-A case", !!e1.error && !rows(e1).length, e1.error?.message ?? "inserted!");
      const e2 = await B.from("chat_threads").insert({ hearing_id: hs!.id, title: "اختراق" }).select("id");
      madeB.push(...rows(e2).map((r) => r.id));
      check("OTHER cannot create a session on an office-A hearing", !!e2.error && !rows(e2).length, e2.error?.message ?? "inserted!");
      if (tB) {
        const e3 = await B.from("chat_threads").update({ case_id: caseId }).eq("id", tB.id).select("id");
        check("OTHER cannot move its own session to an office-A case (the database refuses)", !!e3.error && !rows(e3).length, e3.error?.message ?? "moved!");
        let moveErr = "";
        try { await moveThreadToCase(B as unknown as Db, tB.id, caseId); } catch (e) { moveErr = e instanceof Error ? e.message : String(e); }
        check("moveThreadToCase: OTHER cannot move its session to an office-A case", moveErr !== "", moveErr || "moved!");
        let moveA = "";
        try { await moveThreadToCase(B as unknown as Db, tA.id, caseId); } catch (e) { moveA = e instanceof Error ? e.message : String(e); }
        check("moveThreadToCase: OTHER cannot move office A's session", moveA !== "", moveA || "moved!");
      }
      // a hearing of ANOTHER case of the same office does not fit this thread's case
      if (hOther) {
        const e4 = await A.from("chat_threads").insert({ case_id: hs!.case_id, hearing_id: hOther.id, title: "اختراق" }).select("id");
        madeA.push(...rows(e4).map((r) => r.id));
        check("A cannot link a session to a hearing of another case", !!e4.error && !rows(e4).length, e4.error?.message ?? "inserted!");
      }
      // A moves a general session to its own case (the lawyer's action); only a general session can move
      await moveThreadToCase(A as unknown as Db, tA.id, caseId);
      const { data: after } = await A.from("chat_threads").select("case_id").eq("id", tA.id).single();
      check("A moves a general session to its case (moveThreadToCase)", after?.case_id === caseId);
      let again = "";
      try { await moveThreadToCase(A as unknown as Db, tA.id, caseId); } catch (e) { again = e instanceof Error ? e.message : String(e); }
      check("a session that already has a case cannot be moved again", again !== "", again || "moved!");
    } else check("A has a case and a hearing to test sessions", false);
  } finally {
    if (madeA.length) await A.from("chat_threads").delete().in("id", madeA);
    if (madeB.length) await B.from("chat_threads").delete().in("id", madeB);
  }
}

// ---------- the edit highlights (split layout PR 2): a case page reads only ITS OWN case's open proposals ----------
{
  const { data: cases2 } = await A.from("cases").select("id, court").limit(2);
  const mine = cases2?.[0];
  const mineOther = cases2?.[1];
  const made: string[] = [];
  if (mine && mineOther) {
    try {
      const NEW = "محكمة اختبار الظهور";
      const p = await createProposal(A as unknown as Db, { caseId: mine.id, ops: [{ tool: "update_case", args: { case: mine.id, court: NEW, quote: NEW }, source: { kind: "chat" } }], sourceTexts: [NEW] });
      made.push(p.id);
      const cfA = await getCaseFile(A as unknown as Db, mine.id);
      const own = await loadPendingEdits(A as unknown as Db, mine.id, cfA);
      check("edits: the case page reads its own open proposal", own.groups.some((g) => g.proposalId === p.id) && own.casePatch?.court === NEW, JSON.stringify(own.groups));
      const cfOther = await getCaseFile(A as unknown as Db, mineOther.id);
      const other = await loadPendingEdits(A as unknown as Db, mineOther.id, cfOther);
      check("edits: ANOTHER case of the same office does not show it", !other.groups.some((g) => g.proposalId === p.id) && other.casePatch?.court !== NEW);
      // the outsider: sees no proposal, gets no old values, cannot decide it
      const { data: bSees } = await B.from("proposals").select("id").eq("id", p.id);
      check("edits: OTHER cannot read the proposal", (bSees?.length ?? 0) === 0);
      const rowsB = await loadCardRows(B as unknown as Db, [p]);
      check("edits: OTHER gets no old → new lines (the case row is invisible to it)", Object.values(rowsB).every((r) => r.length === 0), JSON.stringify(rowsB));
      let decideErr = "";
      try { await decideProposal(B as unknown as Db, p.id, { mode: "confirm" }); } catch (e) { decideErr = e instanceof Error ? e.message : String(e); }
      const { data: still } = await A.from("cases").select("court").eq("id", mine.id).single();
      check("edits: OTHER cannot confirm it, nothing saved", decideErr !== "" && still?.court === (cases2?.[0] as { court: string | null }).court, decideErr);
    } finally {
      if (made.length) await A.from("proposals").delete().in("id", made);
    }
  } else check("A has two cases to test the edit highlights", false);
}

// ---------- «تراجع» after a confirm (PR 2b): the log of confirms and undos is the office's own ----------
{
  const { data: tc } = await A.from("cases").insert({ title: "اختبار-RLS-تراجع", source_kind: "manual" }).select("id").single();
  try {
    const T = "واقعة اختبار RLS للتراجع";
    const p = await createProposal(A as unknown as Db, { caseId: tc!.id, ops: [{ tool: "add_fact", args: { case: tc!.id, text: T, quote: T }, source: { kind: "chat" } }], sourceTexts: [T] });
    const r = await decideProposal(A as unknown as Db, p.id, { mode: "confirm" });
    const evId = r.undo_event_id!;
    const { data: aEv } = await A.from("proposal_events").select("id, office_id, action").eq("proposal_id", p.id);
    check("undo: DEMO reads the confirm event of its own office", aEv?.length === 1 && aEv[0].action === "confirm" && aEv[0].office_id === officeA);
    const { data: bEv } = await B.from("proposal_events").select("id").eq("office_id", officeA);
    const { data: bById } = await B.from("proposal_events").select("id").eq("id", evId);
    check("undo: OTHER reads 0 events of office A", (bEv?.length ?? 0) === 0 && (bById?.length ?? 0) === 0);
    const bIns = await B.from("proposal_events").insert({ office_id: officeA, proposal_id: p.id, op_ids: ["op1"], action: "confirm" }).select("id");
    check("undo: OTHER cannot insert an event into office A", !!bIns.error && bIns.data === null, bIns.error?.message ?? "inserted!");
    const bUp = await B.from("proposal_events").update({ op_ids: ["x"] }).eq("id", evId).select("id");
    const bDel = await B.from("proposal_events").delete().eq("id", evId).select("id");
    const aUp = await A.from("proposal_events").update({ op_ids: ["x"] }).eq("id", evId).select("id");
    const aDel = await A.from("proposal_events").delete().eq("id", evId).select("id");
    check("undo: nobody can change or delete an event (append-only log, not even DEMO)", !bUp.data?.length && !bDel.data?.length && !aUp.data?.length && !aDel.data?.length);
    const u = await undoConfirm(B as unknown as Db, evId);
    const { data: stillFact } = await A.from("case_facts").select("id").eq("case_id", tc!.id).eq("text", T);
    check("undo: OTHER cannot undo office A's confirm (refused, the fact stays)", !u.ok && stillFact?.length === 1, u.ok ? "undone!" : u.error);
    const { data: afterEv } = await A.from("proposal_events").select("id").eq("proposal_id", p.id);
    check("undo: ...and no event was logged by that attempt", afterEv?.length === 1);
    const uA = await undoConfirm(A as unknown as Db, evId);
    const { data: gone } = await A.from("case_facts").select("id").eq("case_id", tc!.id).eq("text", T);
    const { data: evs2 } = await A.from("proposal_events").select("action, created_by").eq("proposal_id", p.id).order("created_at");
    const uidA2 = (await A.auth.getUser()).data.user!.id;
    check("undo: DEMO can undo its own confirm; both events are logged with who did it", uA.ok && gone?.length === 0 && evs2?.map((e) => e.action).join() === "confirm,undo" && evs2.every((e) => e.created_by === uidA2));
  } finally {
    await A.from("cases").delete().eq("id", tc!.id); // its proposals and events go with it
  }
}

// ---------- «ضدنا · دفوع الخصم»: the reply link (case_arguments.reply_argument_id) stays inside its own office and case ----------
{
  const mkCase = async (db: typeof A, title: string) => (await db.from("cases").insert({ title, source_kind: "manual" }).select("id").single()).data!.id;
  const mkArg = async (db: typeof A, case_id: string, side: "ours" | "opponent", text: string) => (await db.from("case_arguments").insert({ case_id, side, text, source_kind: "manual" }).select("id").single()).data!.id;
  const a1 = await mkCase(A, "اختبار-RLS-رد-1");
  const a2 = await mkCase(A, "اختبار-RLS-رد-2");
  const b1 = await mkCase(B, "اختبار-RLS-رد-ب");
  try {
    const defA = await mkArg(A, a1, "opponent", "دفع اختبار الرد");
    const ourA = await mkArg(A, a1, "ours", "رد اختبار الرد");
    const ourA2 = await mkArg(A, a2, "ours", "رد في دعوى تانية");
    const defB = await mkArg(B, b1, "opponent", "دفع خصم الأوفيس ب");
    const ourB = await mkArg(B, b1, "ours", "رد الأوفيس ب");

    const link = (db: typeof A, id: string, to: string | null) => db.from("case_arguments").update({ reply_argument_id: to }).eq("id", id).select("id");
    const e1 = await link(A, defA, ourA2);
    check("reply link: A cannot link a defense to its own argument of ANOTHER case", !!e1.error, e1.error?.message ?? "linked!");
    const e2 = await link(A, ourA, ourA);
    check("reply link: an argument of ours cannot itself carry a reply link", !!e2.error, e2.error?.message ?? "linked!");
    const e3 = await link(A, defA, defA);
    check("reply link: a defense cannot answer itself", !!e3.error, e3.error?.message ?? "linked!");
    const okA = await link(A, defA, ourA);
    check("reply link: A links its defense to its own argument of the same case", !okA.error && okA.data?.length === 1, okA.error?.message ?? "");

    const e4 = await link(B, defB, ourA);
    check("reply link: OTHER cannot link its defense to an office-A argument", !!e4.error, e4.error?.message ?? "linked!");
    const e5 = await B.from("case_arguments").insert({ case_id: b1, side: "opponent", text: "اختراق", source_kind: "manual", reply_argument_id: ourA }).select("id");
    check("reply link: OTHER cannot insert a defense that points at an office-A argument", !!e5.error && e5.data === null, e5.error?.message ?? "inserted!");
    const e6 = await link(B, defA, ourB);
    check("reply link: OTHER cannot change the reply link of an office-A defense", (e6.data?.length ?? 0) === 0);
    const { data: bSees } = await B.from("case_arguments").select("id").eq("reply_argument_id", ourA);
    check("reply link: OTHER sees 0 rows linked to an office-A argument", (bSees?.length ?? 0) === 0);
    const okB = await link(B, defB, ourB);
    check("reply link: OTHER can link inside its own office (control)", !okB.error && okB.data?.length === 1, okB.error?.message ?? "");

    // through the confirm card (applyOp): office B answering an office-A defense saves nothing
    const T = "رد اختبار اختراق";
    const p = await createProposal(B as unknown as Db, { caseId: b1, ops: [{ tool: "add_argument", args: { case: b1, side: "ours", text: T, answers: defA, quote: T }, source: { kind: "chat" } }], sourceTexts: [T] });
    let refused = "";
    try { await decideProposal(B as unknown as Db, p.id, { mode: "confirm" }); } catch (e) { refused = e instanceof Error ? e.message : String(e); } // a failed card throws and saves nothing
    const { data: made } = await B.from("case_arguments").select("id").eq("case_id", b1).eq("text", T);
    const { data: stillOne } = await A.from("case_arguments").select("reply_argument_id").eq("id", defA).single();
    check("reply link: a card of OTHER with answers = an office-A defense saves nothing", refused !== "" && (made?.length ?? 0) === 0 && stillOne?.reply_argument_id === ourA, refused);
  } finally {
    await A.from("cases").delete().in("id", [a1, a2]);
    await B.from("cases").delete().eq("id", b1);
  }
}

// ---------- live steps and the «استخدمت:» footer (PR 4) ----------
{
  const turn = crypto.randomUUID();
  const uidA = (await A.auth.getUser()).data.user!.id;
  const thread = await createThread(A as unknown as Db, { title: "اختبار الشفافية RLS" });
  try {
    const { error: sErr } = await A.from("chat_turn_steps").insert({ turn_id: turn, seq: 1, label: "بقرا ملف القضية…" });
    check("steps: DEMO records a step of its own turn", !sErr, sErr?.message);
    const { data: bSteps } = await B.from("chat_turn_steps").select("seq").eq("turn_id", turn);
    const { data: bAll } = await B.from("chat_turn_steps").select("id").eq("office_id", officeA);
    check("steps: OTHER cannot read DEMO's steps (by turn id, or by office)", (bSteps?.length ?? 0) === 0 && (bAll?.length ?? 0) === 0);
    const bIns = await B.from("chat_turn_steps").insert({ office_id: officeA, turn_id: turn, seq: 2, label: "x" }).select("id");
    const bAs = await B.from("chat_turn_steps").insert({ turn_id: turn, seq: 3, label: "x", created_by: uidA }).select("id");
    check("steps: OTHER cannot write a step into DEMO's office, or in DEMO's name", !!bIns.error && !!bAs.error);
    const bDel = await B.from("chat_turn_steps").delete().eq("turn_id", turn).select("id");
    check("steps: OTHER cannot remove DEMO's steps", (bDel.data?.length ?? 0) === 0);
    const { data: aSteps } = await A.from("chat_turn_steps").select("seq, label").eq("turn_id", turn);
    check("steps: DEMO still has its step", aSteps?.length === 1 && aSteps[0].label === "بقرا ملف القضية…");
    const { data: aDel } = await A.from("chat_turn_steps").delete().eq("turn_id", turn).select("id");
    check("steps: DEMO removes its own steps", aDel?.length === 1);

    const { data: msg } = await A.from("chat_messages").insert({ thread_id: thread, role: "assistant", content: "رد", sources: [{ document_id: "00000000-0000-4000-8000-000000000001", pages: [2], quote: null, start: null, end: null }] }).select("id").single();
    const { data: bMsg } = await B.from("chat_messages").select("id, sources").eq("id", msg!.id);
    const bUp = await B.from("chat_messages").update({ sources: [] }).eq("id", msg!.id).select("id");
    const { data: aMsg } = await A.from("chat_messages").select("sources").eq("id", msg!.id).single();
    check("footer: OTHER cannot read or change the sources saved with DEMO's answer", (bMsg?.length ?? 0) === 0 && (bUp.data?.length ?? 0) === 0 && Array.isArray(aMsg?.sources) && aMsg.sources.length === 1);
  } finally {
    await A.from("chat_turn_steps").delete().eq("turn_id", turn);
    await A.from("chat_threads").delete().eq("id", thread);
  }
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
