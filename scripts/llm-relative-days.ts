// PAID (one short real Gemini turn, ~1 cent): the model uses the date the code worked out for «بكرة» and the card
// carries «بكرة = …»; nothing is saved (the card is rejected, then everything is removed).
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/llm-relative-days.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { Db } from "@/lib/supabase/server";
import { runAssistantTurn } from "@/lib/assistant/turn";
import { formatDayLabel, parseDmy } from "@/lib/dates";
import { getProposal } from "@/lib/proposals";
import { cairoDateOf } from "@/lib/relative-days";
import { createGeneralThread } from "@/lib/threads";

let fails = 0;
const check = (ok: boolean, what: string, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? `  (${extra})` : ""}`); if (!ok) fails++; };
const NAME = "شريف الاختباري للأيام";

async function main() {
  const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data: auth, error } = await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
  if (error) throw error;
  const db = sb as unknown as Db;
  const { data: m } = await db.from("office_members").select("office_id").eq("user_id", auth.user.id).single();
  const ctx = { userId: auth.user.id, officeId: m!.office_id };
  const thread = await createGeneralThread(db, "اختبار بكرة (مدفوع)");
  try {
    const r = await runAssistantTurn(db, { threadId: thread, userText: `موكل جديد اسمه ${NAME}، شخص. رفعنا له دعوى عمالية ضد شركة النموذج للاختبار وهو المدعي، وأول جلسة بكرة.`, ...ctx });
    console.log(`reply: ${r.text}`);
    const { data: um } = await db.from("chat_messages").select("created_at").eq("thread_id", thread).eq("role", "user").single();
    const [y, mo, d] = cairoDateOf(um!.created_at).split("-").map(Number);
    const tomorrow = new Date(Date.UTC(y, mo - 1, d + 1)).toISOString().slice(0, 10);
    const p = r.proposalIds[0] ? await getProposal(db, r.proposalIds[0]) : null;
    const h = p?.ops.find((o) => o.tool === "add_hearing");
    check(!!h, "the card has the hearing", p?.ops.map((o) => o.tool).join(","));
    check(parseDmy(String(h?.args.date ?? ""))?.iso === tomorrow, "the hearing date is the resolved «بكرة»", `${String(h?.args.date)} vs ${tomorrow}`);
    const n = h?.resolved_from?.date;
    check(n ? `${n.word} = ${n.label}` === `بكرة = ${formatDayLabel(tomorrow)}` : false, "the op carries «بكرة = …»", n ? `${n.word} = ${n.label}` : "none");
  } finally {
    await db.from("proposals").delete().eq("thread_id", thread);
    await db.from("chat_threads").delete().eq("id", thread);
  }
  console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks passed");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
