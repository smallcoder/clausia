// ONE short REAL chat turn (paid, ~1 cent) with a context chip: click «اسأل Clausia» on a fact, type a question, send.
// Proves the whole path in the real app: the pill → the chip → the send action → the data block → the model reads the item → the answer.
// The session it makes is removed again. Needs the app running.
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/ask-live.ts [baseUrl]
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

const BASE = process.argv[2] ?? "http://localhost:4900";
const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
const { data: c } = await sb.from("cases").select("id").eq("case_number", "772").limit(1).single();
const caseId = c!.id;
const started = new Date().toISOString();
const QUESTION = "الواقعة دي تاريخها إيه ومصدرها إيه؟";

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar-EG", timezoneId: "Africa/Cairo" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await page.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90_000 }), page.click('button:has-text("دخول")')]);
  await page.goto(`${BASE}/cases/${caseId}?s=new`, { waitUntil: "load" });
  await page.waitForSelector('aside[aria-label="محادثة Clausia"]');
  await page.waitForTimeout(1500);

  const fact = page.locator('section#facts div[id^="item-"]').first();
  const factText = (await fact.innerText()).replace(/\s+/g, " ").slice(0, 80);
  await fact.hover();
  await fact.locator('xpath=..').locator('button[aria-label^="اسأل Clausia عن"]').click();
  await page.locator("aside textarea").fill(QUESTION);
  console.log(`chip: ${(await page.locator('aside ul[aria-label="عن إيه السؤال"]').innerText()).replace(/\s+/g, " ")}`);
  await page.locator("aside").getByRole("button", { name: "إرسال" }).click();
  // the chip is used up by the send
  await page.waitForFunction(() => !document.querySelector('aside ul[aria-label="عن إيه السؤال"]'), undefined, { timeout: 10_000 });
  console.log("the chip left the composer when the message was sent");

  // wait for the answer (a real model call)
  const deadline = Date.now() + 100_000;
  let reply = "";
  while (Date.now() < deadline) {
    const { data: th } = await sb.from("chat_threads").select("id").eq("case_id", caseId).gte("created_at", started).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (th) {
      const { data: ms } = await sb.from("chat_messages").select("role, content, tool_calls").eq("thread_id", th.id).order("created_at");
      const last = ms?.[ms.length - 1];
      if (last?.role === "assistant" && last.content.trim()) {
        reply = last.content;
        const user = ms!.find((m) => m.role === "user")!;
        const tools = ms!.flatMap((m) => ((m.tool_calls as { calls?: { name: string }[] } | null)?.calls ?? []).map((x) => x.name));
        console.log(`the saved lawyer message is only the question: ${user.content === QUESTION}`);
        console.log(`the model's tool calls: ${tools.join(", ") || "none"}`);
        break;
      }
    }
    await page.waitForTimeout(2000);
  }
  console.log(`fact on the page: ${factText}`);
  console.log(`reply: ${reply.replace(/\s+/g, " ").slice(0, 400) || "(none within 100 s)"}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "screenshots/compare/split/Ask-live-1440-light.png" });
  await ctx.close();
} finally {
  await browser.close();
  await sb.from("chat_threads").delete().eq("case_id", caseId).gte("created_at", started); // the session (its messages go with it)
}
