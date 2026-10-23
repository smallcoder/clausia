// PR 4 (الموكلين), stage 1: a READ-ONLY dry run of «every case links to a client».
// It reads clients, cases, case parties and client documents through the RLS-bound client signed in as the demo user
// (so it sees the demo office only), works out what a migration WOULD do, and writes nothing to the database:
// only `.select()` is used here. The report goes to scripts/out/clients-dry-run.json (that folder is git-ignored: it holds client names).
//
// Where client data lives today (schema, base migration):
//   clients(name, kind, phone, address, notes, ...)          the client record
//   cases.client_id -> clients.id                            the link we want on EVERY case (nullable today)
//   case_parties(is_our_client, client_id)                   the party row of «موكلنا» in a case (client_id optional)
//   documents.client_id                                      client papers (case_id may be empty: shared across cases)
// So the dry run asks, for each case without cases.client_id: which client is it?
//   1. exactly one «our client» party that already has client_id          -> link to that client
//   2. exactly one «our client» party without client_id, and
//        - ONE existing client has the same normalised name              -> link to it
//        - several existing clients have it                              -> can't link (ambiguous)
//        - none                                                          -> create a client from the party name, then link
//   3. no «our client» party, or several different ones                  -> can't link (never guess), with the reason
//
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/clients-dry-run.ts
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import type { Database } from "@/lib/db/types";

// ---------- helpers ----------
/** Arabic name key: أ/إ/آ→ا, ة→ه, ى→ي, no tashkeel / tatweel, one space between words. */
function normName(s: string): string {
  return s
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}
/** Phone key: digits only (Arabic-Indic digits too); +20 / 0020 country code written as 0. Short or empty → null. */
function normPhone(s: string | null): string | null {
  if (!s) return null;
  let d = s.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)).replace(/\D/g, "");
  if (d.startsWith("0020")) d = d.slice(4);
  else if (d.startsWith("20") && d.length >= 11) d = d.slice(2);
  if (!d.startsWith("0")) d = "0" + d;
  return d.length >= 7 ? d : null;
}
const label = (c: { case_number: string | null; case_year: number | null; title: string | null }) =>
  c.case_number ? `${c.case_number}${c.case_year ? ` لسنة ${c.case_year}` : ""}` : c.title ?? "(بدون رقم)";
const hasWords = (hay: string, needle: string) => needle.length > 0 && ` ${hay} `.includes(` ${needle} `);
const looksLikeCompany = (n: string) => /^(شركه|مؤسسه|مصنع|بنك|مجموعه)( |$)/.test(normName(n));

// ---------- sign in (demo user; the password is never printed) ----------
const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key, DEMO_EMAIL: email, DEMO_PASSWORD: password } = process.env;
if (!url || !key || !email || !password) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / DEMO_EMAIL / DEMO_PASSWORD (run with --env-file=.env.local)");
const sb = createClient<Database>(url, key, { auth: { persistSession: false } });
const { error: authError } = await sb.auth.signInWithPassword({ email, password });
if (authError) throw new Error(`Sign-in failed: ${authError.message}`);

// ---------- read ----------
const [clientsRes, casesRes, docsRes] = await Promise.all([
  sb.from("clients").select("id, name, kind, phone, address, created_at, review_status").order("created_at"),
  sb.from("cases").select("id, title, case_number, case_year, status, review_status, client_id, client_role, case_parties(id, name, role, is_our_client, client_id, review_status)").order("created_at"),
  sb.from("documents").select("id, client_id, case_id, doc_type").not("client_id", "is", null),
]);
for (const [what, r] of [["clients", clientsRes], ["cases", casesRes], ["documents", docsRes]] as const) if (r.error) throw new Error(`Reading ${what} failed: ${r.error.message}`);
const clients = clientsRes.data!.filter((c) => c.review_status !== "rejected");
const cases = casesRes.data!.filter((c) => c.review_status !== "rejected"); // the app hides rejected rows too
const clientDocs = docsRes.data!;
const byId = new Map(clients.map((c) => [c.id, c]));

// ---------- (d) existing clients ----------
const casesOf = new Map<string, number>();
for (const c of cases) if (c.client_id) casesOf.set(c.client_id, (casesOf.get(c.client_id) ?? 0) + 1);
const existing = clients.map((c) => ({
  id: c.id, name: c.name, kind: c.kind, phone: c.phone, address: c.address, since: c.created_at.slice(0, 10),
  cases: casesOf.get(c.id) ?? 0, documents: clientDocs.filter((d) => d.client_id === c.id).length,
}));
const byNormName = new Map<string, typeof clients>();
for (const c of clients) byNormName.set(normName(c.name), [...(byNormName.get(normName(c.name)) ?? []), c]);

// ---------- (b) the plan for every case ----------
type Plan = { case_id: string; case: string; title: string | null; status: string; via: string; client: { id: string | null; name: string } };
type Skip = { case_id: string; case: string; title: string | null; status: string; reason: string; parties: string[]; client_role: string | null; candidates: { id: string; name: string; why: string }[] };
const alreadyLinked: string[] = [];
const link: Plan[] = [];
const cannot: Skip[] = [];
const toCreate = new Map<string, { name: string; names_seen: string[]; maybe_company: boolean; cases: string[] }>(); // key: normalised name
const conflicts: string[] = []; // cases.client_id differs from the client_id of its «our client» party: informational, never changed

for (const c of cases) {
  const live = c.case_parties.filter((p) => p.review_status !== "rejected");
  const ours = live.filter((p) => p.is_our_client);
  const ref = { case_id: c.id, case: label(c), title: c.title, status: c.status };
  if (c.client_id) {
    alreadyLinked.push(c.id);
    const other = ours.find((p) => p.client_id && p.client_id !== c.client_id);
    if (other) conflicts.push(`${label(c)}: cases.client_id = «${byId.get(c.client_id)?.name}» but the party «${other.name}» points to «${byId.get(other.client_id!)?.name}»`);
    continue;
  }
  const skip = (reason: string) => {
    const keys = ours.length ? ours : live; // look for existing clients whose full name is inside a party name (a hint only, never a link)
    const candidates: Skip["candidates"] = [];
    for (const p of keys) for (const cl of clients) {
      if (hasWords(normName(p.name), normName(cl.name)) && !candidates.some((x) => x.id === cl.id))
        candidates.push({ id: cl.id, name: cl.name, why: `its name is inside the party «${p.name}»${p.is_our_client ? "" : " (not marked as our client)"}` });
    }
    cannot.push({ ...ref, reason, parties: live.map((p) => `${p.name} (${p.role}${p.is_our_client ? ", our client" : ""})`), client_role: c.client_role, candidates });
  };
  if (ours.length === 0) { skip("no party is marked as our client, so the client is not known"); continue; }
  const linkedIds = [...new Set(ours.map((p) => p.client_id).filter((x): x is string => !!x))];
  const names = [...new Set(ours.map((p) => normName(p.name)))];
  if (linkedIds.length > 1 || (linkedIds.length === 0 && names.length > 1)) { skip(`more than one client party (${ours.map((p) => p.name).join(" / ")})`); continue; }
  if (linkedIds.length === 1) {
    const cl = byId.get(linkedIds[0]);
    if (!cl) { skip("the client party points to a client that is not readable"); continue; }
    link.push({ ...ref, via: "our-client party already has client_id", client: { id: cl.id, name: cl.name } });
    continue;
  }
  const p = ours[0], k = normName(p.name);
  if (!k) { skip("the client party has an empty name"); continue; }
  const same = byNormName.get(k) ?? [];
  if (same.length > 1) { skip(`the party name «${p.name}» matches ${same.length} existing clients`); continue; }
  if (same.length === 1) { link.push({ ...ref, via: "same name as an existing client", client: { id: same[0].id, name: same[0].name } }); continue; }
  const entry = toCreate.get(k) ?? { name: p.name.trim(), names_seen: [], maybe_company: looksLikeCompany(p.name), cases: [] };
  if (!entry.names_seen.includes(p.name.trim())) entry.names_seen.push(p.name.trim());
  entry.cases.push(label(c));
  toCreate.set(k, entry);
  link.push({ ...ref, via: "new client from the party name", client: { id: null, name: entry.name } });
}

// ---------- (c) likely duplicates among existing clients AND the clients to create ----------
type Member = { source: "existing" | "to create"; id: string | null; name: string; phone: string | null; cases: number };
const members: (Member & { nk: string; pk: string | null })[] = [
  ...clients.map((c) => ({ source: "existing" as const, id: c.id, name: c.name, phone: c.phone, cases: casesOf.get(c.id) ?? 0, nk: normName(c.name), pk: normPhone(c.phone) })),
  ...[...toCreate].map(([nk, e]) => ({ source: "to create" as const, id: null, name: e.name, phone: null, cases: e.cases.length, nk, pk: null })),
];
const parent = members.map((_, i) => i);
const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
const seenKey = new Map<string, number>();
members.forEach((m, i) => {
  for (const k of [m.nk && `n:${m.nk}`, m.pk && `p:${m.pk}`]) {
    if (!k) continue;
    const j = seenKey.get(k);
    if (j === undefined) seenKey.set(k, i); else parent[find(i)] = find(j);
  }
});
const groups = new Map<number, number[]>();
members.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
const duplicates = [...groups.values()].filter((g) => g.length > 1).map((g) => {
  const ms = g.map((i) => members[i]);
  const reasons = [
    new Set(ms.map((m) => m.nk)).size < ms.length ? "same name (after normalising)" : null,
    ms.filter((m) => m.pk).length > new Set(ms.map((m) => m.pk).filter(Boolean)).size ? "same phone" : null,
  ].filter(Boolean);
  return { reason: reasons.join(" + ") || "linked by a shared name or phone", members: ms.map(({ source, id, name, phone, cases }) => ({ source, id, name, phone, cases })) };
});

// ---------- report ----------
const report = {
  generated_at: new Date().toISOString(),
  scope: "demo user's office only (RLS-bound); other offices are not read",
  totals: { clients_now: clients.length, cases: cases.length, cases_already_linked: alreadyLinked.length, client_documents: clientDocs.length },
  clients_to_create: [...toCreate.values()].map((e) => ({ name: e.name, names_seen: e.names_seen, maybe_company: e.maybe_company, cases: e.cases })),
  cases_to_link: link,
  cases_cannot_link: cannot,
  duplicate_groups: duplicates,
  existing_clients: existing,
  consistency_notes: conflicts,
};
mkdirSync("scripts/out", { recursive: true });
writeFileSync("scripts/out/clients-dry-run.json", JSON.stringify(report, null, 2) + "\n");

const line = "-".repeat(70);
console.log(`${line}\nClients dry run (READ ONLY, nothing was written)\n${line}`);
console.log(`Office clients now: ${clients.length} · cases: ${cases.length} (rejected rows left out) · already linked: ${alreadyLinked.length}`);
console.log(`\n(a) Clients to create: ${toCreate.size}`);
for (const e of toCreate.values()) console.log(`    - ${e.name}${e.maybe_company ? "  [looks like a company]" : ""}  · cases: ${e.cases.join(", ")}`);
console.log(`\n(b) Cases to link: ${link.length}   ·   cannot link: ${cannot.length}`);
for (const l of link) console.log(`    + ${l.case}  →  ${l.client.name}  (${l.via})`);
for (const s of cannot) {
  console.log(`    ! ${s.case}${s.title ? ` · ${s.title}` : ""}  [${s.status}]\n        reason: ${s.reason}\n        parties: ${s.parties.join(" | ") || "(none)"}\n        client_role: ${s.client_role ?? "(none)"}`);
  for (const c of s.candidates) console.log(`        candidate (hint only, NOT linked): ${c.name} — ${c.why}`);
}
console.log(`\n(c) Likely duplicate groups: ${duplicates.length}`);
duplicates.forEach((g, i) => {
  console.log(`    group ${i + 1} (${g.reason})`);
  for (const m of g.members) console.log(`      - ${m.name} · ${m.phone ?? "no phone"} · ${m.cases} case(s) · ${m.source}`);
});
console.log(`\n(d) Clients that already exist: ${existing.length}`);
for (const c of existing) console.log(`    - ${c.name} · ${c.phone ?? "no phone"} · ${c.cases} case(s)${c.documents ? ` · ${c.documents} doc(s)` : ""}`);
if (conflicts.length) { console.log(`\nConsistency notes (not changed):`); conflicts.forEach((c) => console.log(`    ~ ${c}`)); }
console.log(`\nReport: scripts/out/clients-dry-run.json`);
await sb.auth.signOut();
