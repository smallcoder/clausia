// Prints getCaseFile(caseId) as JSON (what the opinion/memo LLM will read). Arg: case id, or a case number like 4471/2026.
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/dump-case-file.ts 4471/2026 > docs/case-file.sample.json
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { Db } from "@/lib/supabase/server";
import { getCaseFile } from "@/lib/case-file";

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
const { error } = await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
if (error) throw error;
const arg = process.argv[2] ?? "";
let id = arg;
if (arg.includes("/")) {
  const [n, y] = arg.split("/");
  const { data } = await sb.from("cases").select("id").eq("case_number", n).eq("case_year", Number(y)).limit(1).single();
  id = data!.id;
}
console.log(JSON.stringify(await getCaseFile(sb as unknown as Db, id), null, 2));
