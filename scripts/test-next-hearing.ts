/**
 * Next-hearing chain test, as the DEMO lawyer (RLS applies).
 * Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-next-hearing.ts
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { Db } from "@/lib/supabase/server";
import { applyOp, MANUAL } from "@/lib/tools/apply";
import { caseHearings } from "@/lib/hearings";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}
async function refused(fn: () => Promise<unknown>): Promise<string | null> {
  try { await fn(); return null; } catch (e) { return (e as Error).message; }
}

async function main() {
  const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { error: authErr } = await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
  if (authErr) throw new Error(`sign-in failed: ${authErr.message}`);
  const db = sb as unknown as Db;

  let clientId: string | null = null;
  let caseId: string | null = null;
  try {
    clientId = (await applyOp(db, "create_client", { name: "اختبار-جلسات موكل", quote: "اختبار" }, MANUAL)).id;
    caseId = (await applyOp(db, "create_case", { client: clientId, title: "اختبار-جلسات", court: "محكمة الاختبار", circuit: "الدائرة 1", client_role: "plaintiff", quote: "اختبار" }, MANUAL)).id;

    const h1 = (await applyOp(db, "add_hearing", { case: caseId, date: "1/11/2026", purpose: "أول جلسة", quote: "جلسة 1/11/2026" }, MANUAL)).id;
    check("add_hearing creates the hearing", !!h1);

    // postponed without next_date → refused, nothing changes
    const e1 = await refused(() => applyOp(db, "record_decision", { hearing: h1, decision: "postponed", decision_text: "أجلت", quote: "أجلت" }, MANUAL));
    check("postponed without next_date is refused", !!e1 && /next hearing date/.test(e1), e1 ?? "accepted");

    // next_date before (or on) the hearing date → refused
    const e2 = await refused(() => applyOp(db, "record_decision", { hearing: h1, decision: "postponed", next_date: "20/10/2026", quote: "أجلت" }, MANUAL));
    check("next_date before the hearing date is refused", !!e2 && /after the hearing date/.test(e2), e2 ?? "accepted");
    const e3 = await refused(() => applyOp(db, "record_decision", { hearing: h1, decision: "postponed", next_date: "1/11/2026", quote: "أجلت" }, MANUAL));
    check("next_date equal to the hearing date is refused", !!e3, e3 ?? "accepted");

    // an unclear date is refused by the tool schema (never guessed)
    const e4 = await refused(() => applyOp(db, "record_decision", { hearing: h1, decision: "postponed", next_date: "الشهر الجاي", quote: "أجلت" }, MANUAL));
    check("unclear next_date is refused", !!e4, e4 ?? "accepted");

    let rows = await caseHearings(db, caseId);
    check("refusals left one undecided hearing", rows.length === 1 && rows[0].decision_type === null, JSON.stringify(rows.map((r) => [r.hearing_date, r.decision_type])));

    // postponed with next_date → next hearing created and linked both ways
    const r = await applyOp(db, "record_decision", { hearing: h1, decision: "postponed", decision_text: "أجلت لتقديم المستندات", next_date: "15/11/2026", next_requirements: "تقديم أصل العقد", quote: "أجلت لتقديم المستندات" }, MANUAL);
    rows = await caseHearings(db, caseId);
    const old = rows.find((x) => x.id === h1);
    const nw = rows.find((x) => x.hearing_date === "2026-11-15");
    check("a new hearing exists on 15/11/2026", !!nw, JSON.stringify(rows.map((x) => x.hearing_date)));
    check("new.previous_hearing_id = old", nw?.previous_hearing_id === h1, String(nw?.previous_hearing_id));
    check("old.next_hearing_id = new", !!nw && old?.next_hearing_id === nw.id, String(old?.next_hearing_id));
    check("rpc returns next_hearing_id", !!nw && (r.extra as { next_hearing_id?: string } | undefined)?.next_hearing_id === nw.id);
    check("decision saved on old (type, text, requirements)", old?.decision_type === "postponed" && old.decision_text === "أجلت لتقديم المستندات" && old.next_requirements === "تقديم أصل العقد");
    check("new hearing is undecided, purpose = requirements", nw?.decision_type === null && nw?.purpose === "تقديم أصل العقد");
    check("caseHearings fills next_date / previous_date", old?.next_date === "2026-11-15" && nw?.previous_date === "2026-11-01");

    // another office cannot see or decide these hearings (RLS)
    if (process.env.OTHER_EMAIL && process.env.OTHER_PASSWORD) {
      const other = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
      await other.auth.signInWithPassword({ email: process.env.OTHER_EMAIL, password: process.env.OTHER_PASSWORD });
      const odb = other as unknown as Db;
      check("other office sees none of the case's hearings", (await caseHearings(odb, caseId)).length === 0);
      const e5 = await refused(() => applyOp(odb, "record_decision", { hearing: nw!.id, decision: "struck_off", quote: "x" }, MANUAL));
      check("other office cannot record a decision", !!e5, e5 ?? "accepted");
    }

    // reserved_for_judgment on the new hearing → case status
    await applyOp(db, "record_decision", { hearing: nw!.id, decision: "reserved_for_judgment", decision_text: "حجز للحكم لجلسة 20/12/2026", quote: "حجز للحكم" }, MANUAL);
    const { data: c } = await sb.from("cases").select("status").eq("id", caseId).single();
    check("reserved_for_judgment sets case status", c?.status === "reserved_for_judgment", String(c?.status));
  } catch (e) {
    check("unexpected error", false, (e as Error).message);
  } finally {
    if (caseId) {
      const { error } = await sb.from("cases").delete().eq("id", caseId);
      check("cleanup: temp case deleted", !error, error?.message);
    }
    if (clientId) {
      const { error } = await sb.from("clients").delete().eq("id", clientId);
      check("cleanup: temp client deleted", !error, error?.message);
    }
  }
  console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
