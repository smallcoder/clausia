// Screenshots of a card with a date worked out from the lawyer's words («بكرة = الخميس 22/10/2026»), light and dark.
// Fake data, said on Wednesday 21/10/2026. Three steps (the seed uses app code, the shots use Playwright):
//   npx tsx --conditions=react-server --env-file=.env.local scripts/rd-days-shots.ts seed      → prints the thread id
//   SHOT_BASE=http://localhost:3500 npx tsx --env-file=.env.local scripts/rd-days-shots.ts shoot <threadId>
//   npx tsx --conditions=react-server --env-file=.env.local scripts/rd-days-shots.ts clean <threadId>
// → screenshots/relative-days/card-<light|dark>[-open].png
import { mkdirSync } from "node:fs";

const [mode, id] = process.argv.slice(2);
const NAME = "مروان الاختباري";

async function signIn() {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
  if (error) throw error;
  return sb as unknown as import("@/lib/supabase/server").Db;
}

if (mode === "seed") {
  const db = await signIn();
  const { createGeneralThread } = await import("@/lib/threads");
  const { createProposal } = await import("@/lib/proposals");
  const { resolveRelativeDays } = await import("@/lib/relative-days");
  const { fromRelativeWords } = await import("@/lib/assistant/turn");
  const text = `موكل جديد اسمه ${NAME}، اتفصل من الشغل امبارح، ورفعنا له دعوى عمالية. أول جلسة بكرة.`;
  const at = "2026-10-21T08:00:00Z";
  const thread = await createGeneralThread(db, "عرض: بكرة = الخميس");
  const { data: um } = await db.from("chat_messages").insert({ thread_id: thread, role: "user", content: text }).select("id").single();
  const { data: am } = await db.from("chat_messages").insert({ thread_id: thread, role: "assistant", content: "جهّزت ملف القضية. راجع التواريخ اللي حسبتها من كلامك، ولما توافق هحفظه." }).select("id").single();
  const resolved = resolveRelativeDays(text, at);
  const src = { kind: "chat" as const, message_id: um!.id };
  const ops = [
    { tool: "create_client", args: { ref: "c1", name: NAME, kind: "person", quote: NAME } },
    { tool: "create_case", args: { ref: "k1", client: "@c1", title: "دعوى عمالية", case_type: "عمال", client_role: "plaintiff", facts_date: "20/10/2026", quote: "اتفصل من الشغل امبارح" } },
    { tool: "add_hearing", args: { case: "@k1", date: "22/10/2026", quote: "أول جلسة بكرة" } },
  ].map((o) => ({ ...o, source: { ...src, quote: o.args.quote }, resolved_from: fromRelativeWords(o.args, [text], resolved) }));
  await createProposal(db, { threadId: thread, messageId: am!.id, ops, sourceTexts: [text] });
  console.log(thread);
} else if (mode === "clean") {
  const db = await signIn();
  await db.from("proposals").delete().eq("thread_id", id);
  await db.from("chat_threads").delete().eq("id", id);
  console.log("removed", id);
} else if (mode === "shoot") {
  const { chromium } = await import("@playwright/test");
  const BASE = process.env.SHOT_BASE ?? "http://localhost:3500";
  mkdirSync("screenshots/relative-days", { recursive: true });
  const browser = await chromium.launch();
  const login = await browser.newContext({ locale: "ar-EG", timezoneId: "Africa/Cairo" });
  const lp = await login.newPage();
  await lp.goto(`${BASE}/login`);
  await lp.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await lp.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([lp.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90_000 }), lp.click('button:has-text("دخول")')]);
  const state = await login.storageState();
  await login.close();
  for (const scheme of ["light", "dark"] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 2000 }, deviceScaleFactor: 2, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: scheme, storageState: state });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/chat/${id}`, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const card = page.locator("div.rounded-xl", { hasText: "ملف قضية جديد" }).first();
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: `screenshots/relative-days/card-${scheme}.png` });
    // open the hearing row: the note sits next to the date field
    await card.getByRole("button", { name: /22\/10\/2026/ }).first().click();
    await page.waitForTimeout(400);
    await card.screenshot({ path: `screenshots/relative-days/card-${scheme}-open.png` });
    await ctx.close();
  }
  await browser.close();
  console.log("shots in screenshots/relative-days/");
} else {
  console.error("usage: seed | shoot <threadId> | clean <threadId>");
  process.exit(1);
}
