// Card decisions end to end (server side): nothing is saved before the tap; an edited op is saved as the
// lawyer's (created_by_kind lawyer); «حفظ كمقترحات» saves review_status suggested; «رفض الكل» saves nothing.
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-card-modes.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { Db } from "@/lib/supabase/server";
import { runAssistantTurn } from "@/lib/assistant/turn";
import { decideProposal, getProposal } from "@/lib/proposals";
import { createGeneralThread } from "@/lib/threads";

let fails = 0;
const check = (ok: boolean, what: string, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? `  (${extra})` : ""}`); if (!ok) fails++; };

async function main() {
  const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data: auth, error } = await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
  if (error) throw error;
  const db = sb as unknown as Db;
  const { data: m } = await db.from("office_members").select("office_id").eq("user_id", auth.user.id).single();
  const ctx = { userId: auth.user.id, officeId: m!.office_id };
  const NAME = "كريم الاختباري للبطاقات";
  const count = async () => (await db.from("clients").select("id", { count: "exact", head: true }).eq("name", NAME)).count ?? 0;

  const thread = await createGeneralThread(db, "اختبار أوضاع البطاقة");
  try {
    // 1) a card is proposed; nothing is written yet
    const t1 = await runAssistantTurn(db, { threadId: thread, userText: `موكل جديد اسمه ${NAME}، شخص، تليفونه 01000000099. رفعنا له دعوى رقم 7310 لسنة 2026 أمام محكمة شمال القاهرة الابتدائية الدائرة 5 مدني، وهو المدعي، ضد شركة النموذج للاختبار.`, ...ctx });
    check(t1.proposalIds.length === 1, "one card proposed", `${t1.proposalIds.length}`);
    const p1 = (await getProposal(db, t1.proposalIds[0]))!;
    check(await count() === 0, "nothing saved before the tap");
    const clientOp = p1.ops.find((o) => o.tool === "create_client");
    const caseOp = p1.ops.find((o) => o.tool === "create_case");
    check(!!clientOp && !!caseOp, "card has create_client + create_case", p1.ops.map((o) => o.tool).join(","));

    // 2) the lawyer edits the phone on the client and confirms only that op
    const d1 = await decideProposal(db, p1.id, { mode: "confirm", opIds: [clientOp!.op_id], edits: { [clientOp!.op_id]: { phone: "01000000088" } } });
    const c = await db.from("clients").select("phone, created_by_kind, review_status, source_kind, source_message_id").eq("name", NAME).single();
    check(c.data?.phone === "01000000088", "edited value saved", c.data?.phone ?? "");
    check(c.data?.created_by_kind === "lawyer", "edited op saved as the lawyer's", c.data?.created_by_kind ?? "");
    check(c.data?.review_status === "confirmed" && c.data?.source_kind === "chat" && !!c.data?.source_message_id, "confirmed, source chat + message");
    check(d1.status === "partially_confirmed", "card partially confirmed", d1.status);

    // 3) the rest «حفظ كمقترحات»
    const d2 = await decideProposal(db, p1.id, { mode: "suggest" });
    const k = await db.from("cases").select("id, review_status, created_by_kind, client_id").eq("case_number", "7310").eq("case_year", 2026).maybeSingle();
    check(k.data?.review_status === "suggested", "save as suggestions → review_status suggested", k.data?.review_status ?? "none");
    check(k.data?.created_by_kind === "model", "unedited op stays created_by model", k.data?.created_by_kind ?? "");
    check(!!k.data?.client_id, "@ref resolved to the client confirmed earlier in the same card");
    check(d2.status === "confirmed" && !!d2.case_id, "card closed and linked to the case", `${d2.status} ${d2.case_id ? "case" : "no case"}`);

    // 4) another card, rejected → nothing saved
    const t2 = await runAssistantTurn(db, { threadId: thread, userText: "وأول جلسة يوم 3/11/2026 للإعلان.", ...ctx });
    const before = (await db.from("hearings").select("id", { count: "exact", head: true }).eq("case_id", k.data!.id)).count ?? 0;
    if (t2.proposalIds[0]) await decideProposal(db, t2.proposalIds[0], { mode: "reject" });
    const after = (await db.from("hearings").select("id", { count: "exact", head: true }).eq("case_id", k.data!.id)).count ?? 0;
    check(t2.proposalIds.length === 1, "hearing card proposed");
    check(before === 0 && after === 0, "reject all saves nothing", `${before} → ${after}`);
    const p2 = t2.proposalIds[0] ? await getProposal(db, t2.proposalIds[0]) : null;
    check(p2?.status === "rejected", "card marked rejected", p2?.status ?? "");
  } finally {
    const { data: cl } = await db.from("clients").select("id").eq("name", NAME);
    await db.from("cases").delete().eq("case_number", "7310").eq("case_year", 2026);
    if (cl?.length) await db.from("clients").delete().in("id", cl.map((x) => x.id));
    await db.from("chat_threads").delete().eq("id", thread);
  }
  console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks passed");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
