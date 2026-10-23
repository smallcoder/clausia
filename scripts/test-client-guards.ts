// The two client guards of PR 4, with NO database write:
//  (a) unit tests of applyOp with a fake Db (nothing is sent anywhere):
//      - update_case.client on a case that already has a client: refused for a model card, allowed with client_by_lawyer or MANUAL
//      - clientByLawyer (the line in proposals.ts): an edit of another field does not set it; an edit of `client` does
//      - a client id the lawyer cannot read (the fake `clients` returns no row) is refused in create_case, update_case and add_party
//  (b) a live READ-ONLY RLS check: another office's client is not visible. The office that has no clients cannot give a foreign id, so the check runs
//      both ways: the OTHER user cannot read the demo office's client; the demo user can (control). Also a read-only scripts/sql.sh select looks for a
//      client id of another office (none exists today: the other office has no clients).
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-client-guards.ts
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import type { Db } from "@/lib/supabase/server";
import { clientByLawyer } from "@/lib/proposals";
import { applyOp, MANUAL, type Provenance } from "@/lib/tools/apply";

let fails = 0;
const check = (ok: boolean, what: string, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? `  (${extra})` : ""}`); if (!ok) fails++; };

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CASE = U(1), CLIENT = U(2), OLD_CLIENT = U(3);

/** A fake Db: every query chain resolves from `rows[table]` (single / maybeSingle give the object, awaiting the chain gives a list). Writes are only counted. */
function fakeDb(rows: Record<string, Record<string, unknown> | null>) {
  const writes: string[] = [];
  const db = {
    from(table: string) {
      const row = rows[table] ?? null;
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "in", "is", "order", "limit", "not", "or", "gte", "lte"]) q[m] = () => q;
      for (const m of ["insert", "update", "delete", "upsert"]) q[m] = () => { writes.push(`${m} ${table}`); return q; };
      q.single = async () => ({ data: row, error: null });
      q.maybeSingle = async () => ({ data: row, error: null });
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: row ? [row] : [], error: null }).then(res);
      return q;
    },
  };
  return { db: db as unknown as Db, writes };
}
const rejects = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e instanceof Error ? e.message : String(e); } };

const MODEL: Provenance = { review_status: "confirmed", created_by_kind: "model", source_kind: "chat" };
const UPDATE = { case: CASE, client: CLIENT, quote: "x" };

// ---- (a) update_case: the guard ----
{
  const { db } = fakeDb({ cases: { client_id: OLD_CLIENT, updated_at: "" }, clients: { id: CLIENT } });
  const m = await rejects(applyOp(db, "update_case", UPDATE, { ...MODEL, client_by_lawyer: false }));
  check(m === "الدعوى لها موكل بالفعل", "a model card cannot replace an existing client", String(m));
  const m2 = await rejects(applyOp(db, "update_case", UPDATE, MODEL));
  check(m2 === "الدعوى لها موكل بالفعل", "a model card with client_by_lawyer unset is refused too", String(m2));
  const a = await rejects(applyOp(db, "update_case", UPDATE, { ...MODEL, created_by_kind: "lawyer", client_by_lawyer: true }));
  check(a === null, "client_by_lawyer: true may replace it", String(a));
  const b = await rejects(applyOp(db, "update_case", UPDATE, MANUAL));
  check(b === null, "the manual pick (MANUAL) may replace it", String(b));
  // a lawyer-edited card where the lawyer edited ANOTHER field: provenance says lawyer, client_by_lawyer is false → still refused
  const c = await rejects(applyOp(db, "update_case", UPDATE, { ...MODEL, created_by_kind: "lawyer", client_by_lawyer: false }));
  check(c === "الدعوى لها موكل بالفعل", "created_by_kind lawyer without client_by_lawyer is still refused", String(c));
  // a case with NO client: a model card may fill it
  const { db: empty } = fakeDb({ cases: { client_id: null, updated_at: "" }, clients: { id: CLIENT } });
  const d = await rejects(applyOp(empty, "update_case", UPDATE, MODEL));
  check(d === null, "a model card may fill an EMPTY client", String(d));
}

// ---- (a) the line in proposals.ts ----
check(clientByLawyer({ title: "عنوان جديد" }, { case: CASE, client: CLIENT }) === false, "an edit of another field does not set client_by_lawyer");
check(clientByLawyer({ client: CLIENT }, { case: CASE, client: CLIENT }) === false, "an edit that keeps the same client does not set it");
check(clientByLawyer({ client: OLD_CLIENT }, { case: CASE, client: CLIENT }) === true, "an edit that changes the client sets it");
check(clientByLawyer(undefined, { case: CASE, client: CLIENT }) === false, "no edit: not set");

// ---- (a) visibleClient: a client the lawyer cannot read is refused ----
{
  const { db, writes } = fakeDb({ clients: null, cases: { client_id: null } });
  const NO = "الموكل غير موجود";
  const cc = await rejects(applyOp(db, "create_case", { client: CLIENT, title: "t", quote: "x" }, MANUAL));
  check(cc === NO, "create_case refuses a client that is not visible", String(cc));
  const uc = await rejects(applyOp(db, "update_case", UPDATE, MANUAL));
  check(uc === NO, "update_case refuses a client that is not visible", String(uc));
  const ap = await rejects(applyOp(db, "add_party", { case: CASE, name: "فلان", role: "plaintiff", is_our_client: true, client: CLIENT, quote: "x" }, MANUAL));
  check(ap === NO, "add_party refuses a client that is not visible", String(ap));
  const apn = await rejects(applyOp(fakeDb({ case_parties: { id: U(9) } }).db, "add_party", { case: CASE, name: "فلان", role: "plaintiff", quote: "x" }, MANUAL));
  check(apn === null, "add_party without a client is untouched", String(apn));
  check(writes.length === 0, "the refused ops wrote nothing (fake db)", writes.join(","));
}

// ---- (b) live, read-only: RLS hides another office's client ----
{
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const as = async (email: string, password: string) => {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`sign-in failed: ${error.message}`);
    return sb;
  };
  const demo = await as(process.env.DEMO_EMAIL!, process.env.DEMO_PASSWORD!);
  const other = await as(process.env.OTHER_EMAIL!, process.env.OTHER_PASSWORD!);

  // a read-only select (the Management API, through scripts/sql.sh): every client with its office; the demo user's own list is what RLS shows
  const all = JSON.parse(execFileSync("scripts/sql.sh", ["select id, office_id from clients"], { encoding: "utf8" }).trim()) as { id: string; office_id: string }[];
  const mine = new Set(((await demo.from("clients").select("id")).data ?? []).map((c) => c.id));
  const foreignToDemo = all.filter((c) => !mine.has(c.id));
  console.log(`clients in the database: ${all.length}; visible to the demo user: ${mine.size}; of another office: ${foreignToDemo.length}`);
  for (const f of foreignToDemo.slice(0, 1)) {
    const r = await demo.from("clients").select("id").eq("id", f.id);
    check((r.data ?? []).length === 0, "the demo user cannot read a client of another office", `rows: ${r.data?.length}`);
  }
  if (!foreignToDemo.length) console.log("NOTE  no client of another office exists (the other office has none): the reverse check below stands in for it");

  // the reverse: the OTHER user asks for the demo office's client by id
  const target = [...mine][0];
  const seen = await other.from("clients").select("id").eq("id", target);
  check(!seen.error && (seen.data ?? []).length === 0, "the other office's user cannot read the demo office's client by id", `rows: ${seen.data?.length}, error: ${seen.error?.message ?? "none"}`);
  const control = await demo.from("clients").select("id").eq("id", target);
  check((control.data ?? []).length === 1, "control: the demo user reads that same client", `rows: ${control.data?.length}`);
  const list = await other.from("clients").select("id");
  check((list.data ?? []).length === 0, "the other office's user sees no clients at all", `rows: ${list.data?.length}`);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exitCode = fails ? 1 : 0;
