// Creates the demo lawyer (office A) and a second lawyer (office B, for the RLS test).
// Credentials are generated once and kept in .env.local (git-ignored): DEMO_EMAIL/DEMO_PASSWORD, OTHER_EMAIL/OTHER_PASSWORD.
// Run: npx tsx --env-file=.env.local scripts/create-test-users.ts
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

async function ensure(prefix: "DEMO" | "OTHER", email: string, office: string, name: string) {
  let password = process.env[`${prefix}_PASSWORD`];
  if (!password) {
    password = randomBytes(12).toString("base64url");
    appendFileSync(".env.local", `${prefix}_EMAIL=${email}\n${prefix}_PASSWORD=${password}\n`);
  }
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { office_name: office, display_name: name } });
  if (error && !/already/i.test(error.message)) throw error;
  console.log(`${prefix}: ${email} ${error ? "(exists)" : "(created)"}`);
}

await ensure("DEMO", process.env.DEMO_EMAIL ?? "demo@clausia.test", "مكتب الأستاذ تجريبي للمحاماة", "أ. تجريبي");
await ensure("OTHER", process.env.OTHER_EMAIL ?? "other@clausia.test", "مكتب آخر (اختبار العزل)", "أ. آخر");
