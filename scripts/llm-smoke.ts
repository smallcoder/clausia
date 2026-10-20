// Smoke test for the LLM provider: one tool-call round trip (incl. sending the tool result back).
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/llm-smoke.ts
import { getLlm, type LlmMessage } from "@/lib/llm";
import { writeToolSpecs } from "@/lib/tools/registry";

async function main() {
  const llm = getLlm();
  const tools = writeToolSpecs();
  const messages: LlmMessage[] = [{ role: "user", text: "عندي موكل جديد اسمه «تجريبي سامح عبد الفتاح»، شخص، تليفونه 01000000000." }];
  const r1 = await llm.chat({ system: "أنت مساعد محامٍ مصري. استخدم الأدوات لاقتراح الحفظ.", messages, tools, meta: { purpose: "test" } });
  console.log("text:", r1.text.slice(0, 200));
  console.log("toolCalls:", JSON.stringify(r1.toolCalls));
  if (!r1.toolCalls.length) return;
  messages.push({ role: "assistant", text: r1.text, toolCalls: r1.toolCalls, raw: r1.raw });
  messages.push({ role: "tool", results: r1.toolCalls.map((c) => ({ callId: c.id, name: c.name, result: { status: "proposed", note: "بانتظار تأكيد المحامي" } })) });
  const r2 = await llm.chat({ system: "أنت مساعد محامٍ مصري. استخدم الأدوات لاقتراح الحفظ.", messages, tools, meta: { purpose: "test" } });
  console.log("turn2 text:", r2.text.slice(0, 300), "calls:", r2.toolCalls.length);
}
main().catch((e) => { console.error("FAIL", e); process.exit(1); });
