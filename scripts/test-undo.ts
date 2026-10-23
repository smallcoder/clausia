// «تراجع» after a confirm (PR 2b), end to end on the server side (no model, no browser). Free.
//  - undo round trip for add_fact + add_party, update_case, record_decision (with a new next hearing, and with a moved one):
//    every table of the case is exactly as before, the card is pending again (the page shows the highlights again)
//  - both the confirm and the undo are logged (proposal_events)
//  - undo after the window is refused; a double undo is refused; undo after a row was changed is refused (nothing changes)
//  - a confirm that cannot be reverted later (a new case) is logged with no undo data
// Everything it makes is removed again. Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-undo.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { Db } from "@/lib/supabase/server";
import { getCaseFile } from "@/lib/case-file";
import { loadPendingEdits } from "@/lib/pending-edits";
import { createProposal, decideProposal, getProposal } from "@/lib/proposals";
import { UNDO_SLACK_MS, UNDO_WINDOW_MS, undoConfirm, undoConfirms } from "@/lib/undo";

let fails = 0;
const check = (ok: boolean, what: string, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? `  (${extra})` : ""}`); if (!ok) fails++; };

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
const { error } = await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
if (error) throw error;
const db = sb as unknown as Db;

const TITLE = "اختبار-تراجع-بعد-التأكيد";
const { data: tc } = await db.from("cases").insert({ title: TITLE, court: "محكمة قبل", source_kind: "manual" }).select("id").single();
const caseId = tc!.id;
const src = { kind: "chat" as const };
const made: string[] = [];

/** every table the ops touch, for this case, as one string (keys sorted) */
async function snap(extraCaseIds: string[] = []) {
  const [c, f, p, h] = await Promise.all([
    db.from("cases").select("*").eq("id", caseId),
    db.from("case_facts").select("*").eq("case_id", caseId).order("id"),
    db.from("case_parties").select("*").eq("case_id", caseId).order("id"),
    db.from("hearings").select("*").eq("case_id", caseId).order("id"),
  ]);
  void extraCaseIds;
  return JSON.stringify([c.data, f.data, p.data, h.data], (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
}
const mk = async (ops: { tool: string; args: Record<string, unknown> }[], texts: string[]) => {
  const p = await createProposal(db, { caseId, ops: ops.map((o) => ({ ...o, source: src })), sourceTexts: texts });
  made.push(p.id);
  return p;
};
const events = async (proposalId: string) => (await db.from("proposal_events").select("*").eq("proposal_id", proposalId).order("created_at")).data ?? [];
const pending = async () => loadPendingEdits(db, caseId, await getCaseFile(db, caseId));

try {
  // ---------- 1) add_fact + add_party ----------
  {
    const T = "واقعة اختبار التراجع";
    const before = await snap();
    const p = await mk([
      { tool: "add_fact", args: { case: caseId, text: T, quote: T } },
      { tool: "add_party", args: { case: caseId, name: "طرف اختبار التراجع", role: "defendant", quote: T } },
    ], [T]);
    const r = await decideProposal(db, p.id, { mode: "confirm" });
    check(!!r.undo_event_id && r.status === "confirmed", "add_fact + add_party: the confirm gives an event to undo", r.status);
    check(await snap() !== before, "…and both rows are saved");
    const ev = await events(p.id);
    check(ev.length === 1 && ev[0].action === "confirm" && ev[0].op_ids.join() === "op1,op2" && !!ev[0].undo_data, "the confirm is logged (action, op ids, undo data)");
    const u = await undoConfirm(db, r.undo_event_id!);
    check(u.ok && u.count === 2, "undo works", JSON.stringify(u));
    check(await snap() === before, "the case's tables are exactly as before");
    const after = (await getProposal(db, p.id))!;
    check(after.status === "pending" && after.ops.every((o) => o.status === "pending" && !o.result_id) && !(after as unknown as { decided_at: string | null }).decided_at, "the card is pending again (no result ids, no decision)");
    check((await pending()).groups.some((g) => g.proposalId === p.id && g.opIds.length === 2), "the page shows the two edits again (highlights are back)");
    const ev2 = await events(p.id);
    check(ev2.length === 2 && ev2[1].action === "undo" && ev2[1].undoes_event_id === r.undo_event_id, "the undo is logged and points at the confirm");
    // a second undo
    const again = await undoConfirm(db, r.undo_event_id!);
    check(!again.ok && await snap() === before && (await events(p.id)).length === 2, "a double undo is refused (nothing changes, nothing logged)", again.ok ? "" : again.error);
    // the card can be confirmed again after an undo
    const r2 = await decideProposal(db, p.id, { mode: "confirm" });
    check(r2.status === "confirmed" && !!r2.undo_event_id, "after an undo the same card can be confirmed again");
    check((await undoConfirm(db, r2.undo_event_id!)).ok && await snap() === before, "…and undone again");
  }

  // ---------- 2) update_case ----------
  {
    const before = await snap();
    const p = await mk([{ tool: "update_case", args: { case: caseId, court: "محكمة بعد", summary: "ملخص جديد", quote: "محكمة بعد" } }], ["محكمة بعد ملخص جديد"]);
    const r = await decideProposal(db, p.id, { mode: "confirm" });
    check(!!r.undo_event_id && (await db.from("cases").select("court").eq("id", caseId).single()).data?.court === "محكمة بعد", "update_case: saved");
    const u = await undoConfirm(db, r.undo_event_id!);
    check(u.ok && await snap() === before, "update_case: undo puts the case back exactly (court, summary and updated_at)");
    check((await pending()).casePatch?.court === "محكمة بعد", "…and the page highlights the edit again");
  }

  // ---------- 3) record_decision: a new next hearing ----------
  {
    const { data: h } = await db.from("hearings").insert({ case_id: caseId, hearing_date: "2026-01-05" }).select("id").single();
    const before = await snap();
    const Q = "تأجيل لجلسة 2/2/2026";
    const p = await mk([{ tool: "record_decision", args: { hearing: h!.id, decision: "postponed", next_date: "2/2/2026", quote: Q } }], [Q]);
    const r = await decideProposal(db, p.id, { mode: "confirm" });
    const n = (await db.from("hearings").select("id").eq("case_id", caseId)).data?.length;
    check(!!r.undo_event_id && n === 2, "record_decision (new next hearing): saved, a second hearing exists", String(n));
    const u = await undoConfirm(db, r.undo_event_id!);
    check(u.ok && await snap() === before, "…undo: the decision, the new next hearing and the case status are exactly as before");
    check((await db.from("hearings").select("id").eq("case_id", caseId)).data?.length === 1, "…one hearing again");
    await db.from("hearings").delete().eq("case_id", caseId);
  }

  // ---------- 3b) record_decision: an existing next hearing is moved ----------
  {
    const { data: nx } = await db.from("hearings").insert({ case_id: caseId, hearing_date: "2026-03-01", purpose: "غرض قبل" }).select("id").single();
    const { data: h } = await db.from("hearings").insert({ case_id: caseId, hearing_date: "2026-01-06", next_hearing_id: nx!.id }).select("id").single();
    const before = await snap();
    const Q = "تأجيل لجلسة 5/4/2026";
    const p = await mk([{ tool: "record_decision", args: { hearing: h!.id, decision: "postponed", next_date: "5/4/2026", quote: Q } }], [Q]);
    const r = await decideProposal(db, p.id, { mode: "confirm" });
    const moved = (await db.from("hearings").select("hearing_date").eq("id", nx!.id).single()).data?.hearing_date;
    check(!!r.undo_event_id && moved === "2026-04-05", "record_decision (existing next hearing): the next hearing is moved", moved ?? "");
    const u = await undoConfirm(db, r.undo_event_id!);
    check(u.ok && await snap() === before, "…undo: the moved hearing, the decision and the case are exactly as before");
    await db.from("hearings").update({ next_hearing_id: null }).eq("case_id", caseId);
    await db.from("hearings").delete().eq("case_id", caseId);
  }

  // ---------- 4) the window ----------
  {
    const T = "واقعة اختبار النافذة";
    const before = await snap();
    const p = await mk([{ tool: "add_fact", args: { case: caseId, text: T, quote: T } }], [T]);
    const r = await decideProposal(db, p.id, { mode: "confirm" });
    const late = await undoConfirm(db, r.undo_event_id!, { now: Date.now() + UNDO_WINDOW_MS + UNDO_SLACK_MS + 1500 });
    check(!late.ok && /فات/.test(late.ok ? "" : late.error), "an undo after the window (10 s + slack) is refused", late.ok ? "" : late.error);
    check(await snap() !== before && (await events(p.id)).length === 1, "…the fact stays and no undo is logged");
    const okSlack = await undoConfirm(db, r.undo_event_id!, { now: Date.now() + UNDO_WINDOW_MS + 2000 });
    check(okSlack.ok && await snap() === before, "11–12 s after the confirm still works (the slack for the network)");
  }

  // ---------- 5) a row changed since the confirm ----------
  {
    const T = "واقعة اختبار التغيير";
    const p = await mk([{ tool: "add_fact", args: { case: caseId, text: T, quote: T } }], [T]);
    const r = await decideProposal(db, p.id, { mode: "confirm" });
    await db.from("case_facts").update({ text: `${T} (عدّلها المحامي)` }).eq("case_id", caseId).eq("text", T);
    const u = await undoConfirm(db, r.undo_event_id!);
    const left = (await db.from("case_facts").select("text").eq("case_id", caseId)).data ?? [];
    check(!u.ok && left.length === 1 && left[0].text.includes("عدّلها"), "an inserted row the lawyer edited after the confirm: undo is refused, the edit stays", u.ok ? "" : u.error);
    check((await events(p.id)).length === 1 && (await getProposal(db, p.id))!.status === "confirmed", "…no undo logged, the card stays confirmed");
    await db.from("case_facts").delete().eq("case_id", caseId);

    const p2 = await mk([{ tool: "update_case", args: { case: caseId, court: "محكمة التغيير", quote: "محكمة التغيير" } }], ["محكمة التغيير"]);
    const r2 = await decideProposal(db, p2.id, { mode: "confirm" });
    await db.from("cases").update({ court: "محكمة غيّرها المحامي" }).eq("id", caseId);
    const u2 = await undoConfirm(db, r2.undo_event_id!);
    check(!u2.ok && (await db.from("cases").select("court").eq("id", caseId).single()).data?.court === "محكمة غيّرها المحامي", "a changed column: undo is refused and does not overwrite the change", u2.ok ? "" : u2.error);
  }

  // ---------- 6) two cards confirmed in a row (the page bar), one toast ----------
  {
    await db.from("cases").update({ court: "محكمة قبل" }).eq("id", caseId);
    const before = await snap();
    const a = await mk([{ tool: "add_fact", args: { case: caseId, text: "واقعة أ", quote: "واقعة أ" } }], ["واقعة أ"]);
    const b = await mk([{ tool: "add_party", args: { case: caseId, name: "طرف ب", role: "defendant", quote: "طرف ب" } }], ["طرف ب"]);
    const ra = await decideProposal(db, a.id, { mode: "confirm" });
    const rb = await decideProposal(db, b.id, { mode: "confirm" });
    const u = await undoConfirms(db, [ra.undo_event_id!, rb.undo_event_id!]);
    check(u.ok && u.count === 2 && await snap() === before, "undoConfirms: two cards confirmed in a row are both reverted");
  }

  // ---------- 7) «as suggestions» and a new case ----------
  {
    const T = "واقعة اقتراح";
    const p = await mk([{ tool: "add_fact", args: { case: caseId, text: T, quote: T } }], [T]);
    const r = await decideProposal(db, p.id, { mode: "suggest" });
    check(!r.undo_event_id && (await events(p.id)).length === 0, "«save as suggestions» is not a confirm: no event, no toast");
    await db.from("case_facts").delete().eq("case_id", caseId);

    const NC = "9876";
    const q = await createProposal(db, { threadId: null, ops: [{ tool: "create_case", args: { ref: "k", case_number: NC, stage: "first_instance", title: "اختبار-تراجع-قضية", quote: NC }, source: src }], sourceTexts: [NC] });
    made.push(q.id);
    const rq = await decideProposal(db, q.id, { mode: "confirm" });
    const evq = await events(q.id);
    check(!rq.undo_event_id && evq.length === 1 && evq[0].action === "confirm" && evq[0].undo_data === null, "a confirm that cannot be reverted later (a new case) is logged with no undo data and gives no toast");
    const newCase = rq.ops[0].result_id;
    if (newCase) await db.from("cases").delete().eq("id", newCase);
  }
} finally {
  if (made.length) await db.from("proposals").delete().in("id", made);
  await db.from("cases").delete().eq("id", caseId);
  await db.from("cases").delete().eq("title", "اختبار-تراجع-قضية");
}
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
