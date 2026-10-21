/**
 * Intake test: a lawyer fills a new case by chat only. As DEMO (RLS applies), through the real assistant loop.
 * Every new card is confirmed (decideProposal confirm), like the lawyer tapping «تأكيد الكل».
 * Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-intake.ts
 * Creates a demo case (kept on purpose). Costs ~ a few cents.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { Db } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAssistantTurn } from "@/lib/assistant/turn";
import { decideProposal, type Proposal } from "@/lib/proposals";
import { createGeneralThread } from "@/lib/threads";

const MESSAGES = [
  "عندي موكل جديد اسمه عادل منصور التجريبي، وتليفونه 01000000017.",
  "رفعنا له دعوى رقم 4521 لسنة 2026 مدني كلي أمام محكمة جنوب الجيزة الابتدائية الدائرة 7، وهو المدعي فيها.",
  "الخصم هو شركة النيل التجريبية للمقاولات، وهي المدعى عليها.",
  "موكلنا اشترى شقة من الشركة بعقد بيع مؤرخ 12/3/2024 ودفع الثمن كامل. والشركة سلمت الشقة ناقصة التشطيب في أوائل 2025.",
  "وكمان الشركة بعتت له إنذار من حوالي كام شهر.",
  "طلباتنا: أصليًا إلزام الشركة بإتمام أعمال التشطيب، واحتياطيًا تعويض قدره 200 ألف جنيه.",
  "الشركة دفعت بعدم اختصاص المحكمة محليًا.",
  "أول جلسة كانت يوم 1/10/2026 للإعلان.",
  "الجلسة اتأجلت لـ 15/10/2026 لتقديم مستندات",
  "تحديث: في جلسة 15/10/2026 صدر حكم ابتدائي لصالحنا بإلزام الشركة بإتمام التشطيب، وآخر ميعاد للاستئناف 24/11/2026.",
];

let failures = 0;
function check(ok: boolean, label: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
}

async function main() {
  const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data: auth, error } = await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
  if (error || !auth.user) throw new Error(`sign-in failed: ${error?.message}`);
  const db = sb as unknown as Db;
  const { data: member } = await db.from("office_members").select("office_id").eq("user_id", auth.user.id).single();
  if (!member) throw new Error("no office");

  // start clean: the previous run's intake (kept as a demo) would make Clausia say «مسجلة بالفعل» — correct, but not a test
  {
    const { data: oldClients } = await db.from("clients").select("id").eq("name", "عادل منصور التجريبي");
    await db.from("cases").delete().eq("case_number", "4521").eq("case_year", 2026);
    if (oldClients?.length) await db.from("clients").delete().in("id", oldClients.map((c) => c.id));
    await db.from("chat_threads").delete().eq("title", "اختبار الاستقبال بالمحادثة");
  }
  const threadId = await createGeneralThread(db, "اختبار الاستقبال بالمحادثة");
  console.log(`thread ${threadId}\n`);
  const turnLog: { i: number; proposals: Proposal[]; text: string; rounds: number }[] = [];

  for (let i = 0; i < MESSAGES.length; i++) {
    const t0 = Date.now();
    const r = await runAssistantTurn(db, { threadId, userText: MESSAGES[i], userId: auth.user.id, officeId: member.office_id });
    const decided: Proposal[] = [];
    for (const pid of r.proposalIds) decided.push(await decideProposal(db, pid, { mode: "confirm" }));
    turnLog.push({ i, proposals: decided, text: r.text, rounds: r.rounds });
    console.log(`#${i + 1} المحامي: ${MESSAGES[i]}`);
    console.log(`   Clausia (${r.rounds} جولة، ${Date.now() - t0}ms): ${r.text.replace(/\s+/g, " ").slice(0, 220)}${r.error ? `  [ERROR ${r.error}]` : ""}`);
    for (const p of decided) for (const o of p.ops) console.log(`   - ${o.op_id} ${o.tool} ${JSON.stringify(o.args)} → ${o.status}${o.error ? ` (${o.error})` : ""}${o.quote_verified ? "" : " [quote unverified]"}`);
  }

  // ---------- assertions ----------
  console.log("\n--- records ---");
  const { data: msgs } = await db.from("chat_messages").select("id").eq("thread_id", threadId).eq("role", "user");
  const msgIds = (msgs ?? []).map((m) => m.id);
  const allOps = turnLog.flatMap((t) => t.proposals.flatMap((p) => p.ops));
  const caseOp = allOps.find((o) => o.tool === "create_case" && o.result_id);
  const clientOp = allOps.find((o) => o.tool === "create_client" && o.result_id);

  const { data: client } = clientOp ? await db.from("clients").select("*").eq("id", clientOp.result_id!).single() : { data: null };
  console.log("client:", client && { name: client.name, phone: client.phone, source_kind: client.source_kind, created_by_kind: client.created_by_kind });
  check(!!client && client.name.includes("عادل منصور") && (client.phone ?? "").includes("01000000017"), "client with name + phone");

  const { data: c } = caseOp ? await db.from("cases").select("*").eq("id", caseOp.result_id!).single() : { data: null };
  console.log("case:", c && { number: c.case_number, year: c.case_year, court: c.court, circuit: c.circuit, type: c.case_type, client_role: c.client_role, client_id: c.client_id });
  check(c?.case_number === "4521" && c?.case_year === 2026, "case number 4521 / year 2026");
  check(!!c?.court?.includes("جنوب الجيزة"), "court جنوب الجيزة");
  check(!!c?.circuit && /7|٧|السابعة/.test(c.circuit), "circuit 7");
  check(!!c && !!client && c.client_id === client.id, "case linked to the client");
  if (!c) { summary(threadId, failures); return; }

  const [parties, facts, requests, args, hearings, judgments] = await Promise.all([
    db.from("case_parties").select("*").eq("case_id", c.id),
    db.from("case_facts").select("*").eq("case_id", c.id).order("fact_date"),
    db.from("case_requests").select("*").eq("case_id", c.id),
    db.from("case_arguments").select("*").eq("case_id", c.id),
    db.from("hearings").select("*").eq("case_id", c.id).order("hearing_date"),
    db.from("judgments").select("*").eq("case_id", c.id),
  ]);
  console.log("parties:", parties.data?.map((p) => `${p.name} [${p.role}]${p.is_our_client ? " (موكلنا)" : ""}`));
  console.log("facts:", facts.data?.map((f) => `${f.fact_date ?? "-"} ${f.date_precision} «${f.date_text ?? ""}» ${f.text}`));
  console.log("requests:", requests.data?.map((r) => `${r.kind ?? ""}: ${r.text}`));
  console.log("arguments:", args.data?.map((a) => `${a.side} ${a.kind ?? ""}: ${a.text}`));
  console.log("hearings:", hearings.data?.map((h) => `${h.hearing_date} ${h.decision_type ?? "-"} next=${h.next_hearing_id ?? "-"} ${h.next_requirements ?? ""}`));
  console.log("judgments:", judgments.data?.map((j) => `${j.judgment_date} ${j.kind} deadline=${j.appeal_deadline} ${j.operative_text}`));

  check(!!parties.data?.some((p) => p.name.includes("النيل") && p.role === "defendant"), "opponent party, role defendant");
  check(!!facts.data?.some((f) => f.fact_date === "2024-03-12" && f.date_precision === "day"), "fact 12/3/2024 (day precision)");
  check(!!facts.data?.some((f) => f.fact_date?.startsWith("2025") && f.date_precision === "year" && (f.date_text ?? "").includes("أوائل")), "fact «أوائل 2025» (year precision + date_text)");
  const unclear = turnLog[4];
  const unclearDated = unclear.proposals.flatMap((p) => p.ops).filter((o) => o.tool === "add_fact" && o.args.date);
  check(unclearDated.length === 0, "unclear date («من حوالي كام شهر») not turned into a date");
  check(/[؟?]/.test(unclear.text), "assistant asked about the unclear date");
  check((requests.data?.length ?? 0) >= 1, "client requests saved");
  check(!!args.data?.some((a) => a.side === "opponent" && a.text.includes("اختصاص")), "opponent defence saved");
  const first = hearings.data?.find((h) => h.hearing_date === "2026-10-01");
  const next = hearings.data?.find((h) => h.hearing_date === "2026-10-15");
  check(!!first, "hearing 1/10/2026");
  check(first?.decision_type === "postponed" && !!next && first.next_hearing_id === next.id, "postponed → next hearing 15/10/2026 created and linked");
  check(!!next?.previous_hearing_id && (hearings.data?.length ?? 0) === 2, "exactly two hearings (no duplicate next hearing)");
  check(!!judgments.data?.some((j) => j.appeal_deadline === "2026-11-24"), "judgment with the stated appeal deadline 24/11/2026");

  const items = [client, c, ...(parties.data ?? []), ...(facts.data ?? []), ...(requests.data ?? []), ...(args.data ?? []), ...(hearings.data ?? []), ...(judgments.data ?? [])].filter(Boolean) as { source_kind: string; created_by_kind: string; source_message_id: string | null; source_quote: string | null }[];
  const badProv = items.filter((x) => x.source_kind !== "chat" || x.created_by_kind !== "model" || !x.source_message_id || !msgIds.includes(x.source_message_id));
  check(badProv.length === 0, `provenance on all ${items.length} items: source_kind chat, created_by_kind model, source_message_id = a lawyer message of this thread`);
  check(items.every((x) => !!x.source_quote), "every item keeps its quote");
  const unverified = allOps.filter((o) => !o.quote_verified).length;
  console.log(`quotes unverified: ${unverified} of ${allOps.length} ops`);
  console.log(`case page: /cases/${c.id}`);
  await summary(threadId, failures);
}

async function summary(threadId: string, fails: number) {
  const admin = createAdminClient(); // cost log only, not case data
  const { data } = await admin.from("llm_calls").select("cost_usd, latency_ms, input_tokens, output_tokens, ok").eq("thread_id", threadId);
  const rows = data ?? [];
  const cost = rows.reduce((s, r) => s + Number(r.cost_usd), 0);
  const lat = rows.reduce((s, r) => s + (r.latency_ms ?? 0), 0);
  const tin = rows.reduce((s, r) => s + (r.input_tokens ?? 0), 0);
  const tout = rows.reduce((s, r) => s + (r.output_tokens ?? 0), 0);
  console.log(`\nLLM calls: ${rows.length} (failed ${rows.filter((r) => !r.ok).length}) · tokens in ${tin} / out ${tout} · cost $${cost.toFixed(4)} per intake · model latency total ${(lat / 1000).toFixed(1)}s, avg ${rows.length ? Math.round(lat / rows.length) : 0}ms`);
  console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks passed");
  process.exitCode = fails ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exit(1); });
