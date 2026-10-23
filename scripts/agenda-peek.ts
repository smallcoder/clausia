// What the demo account's agenda holds (read only): hearings per day around today, the undecided count, the saved deadlines.
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/agenda-peek.ts
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
const { data } = await sb.from("hearings").select("hearing_date, location, decision_type, purpose, cases(court, circuit, case_number, case_year, case_parties(name, is_our_client, review_status))").order("hearing_date").neq("review_status", "rejected");
const by = new Map<string, number>();
for (const h of data ?? []) by.set(h.hearing_date, (by.get(h.hearing_date) ?? 0) + 1);
console.log([...by].map(([d, n]) => `${d}:${n}`).join("  "));
console.log("with location:", (data ?? []).filter((h) => h.location).length, "undecided:", (data ?? []).filter((h) => !h.decision_type && h.hearing_date < new Date().toISOString().slice(0, 10)).length);
console.log("with opponent:", (data ?? []).filter((h) => (h.cases as unknown as { case_parties: { is_our_client: boolean }[] })?.case_parties?.some((p) => !p.is_our_client)).length, "of", data?.length);
