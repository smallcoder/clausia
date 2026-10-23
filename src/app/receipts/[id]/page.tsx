// «إيصال استلام»: a clean printable receipt for ONE confirmed receipt (PR 5). It lives outside the app shell (no sidebar, no chat) so the browser prints just the paper.
// The office's own style (letterhead, logo, serial numbers) comes with PR 6: this is the plain layout, drawn as ink on white paper in either theme.
// RLS-bound: a movement of another office, or one that is not a confirmed receipt, is a 404.
import { notFound } from "next/navigation";
import { ReceiptSheet } from "@/components/accounts/ReceiptSheet";
import { caseNumberText, caseSubject } from "@/lib/labels";
import { fromDb } from "@/lib/money";
import { createClient, getSession } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = { title: "إيصال استلام" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const db = await createClient();
  const session = await getSession(db);
  if (!session) notFound();
  const { data: m } = await db.from("account_movements").select("id, client_id, case_id, amount_piasters, method, moved_on, note")
    .eq("id", id).eq("kind", "receipt").eq("review_status", "confirmed").maybeSingle();
  if (!m) notFound();
  const [{ data: client }, { data: kase }, { data: office }] = await Promise.all([
    db.from("clients").select("name").eq("id", m.client_id).maybeSingle(),
    m.case_id ? db.from("cases").select("title, case_type, case_number, case_year").eq("id", m.case_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("offices").select("name").eq("id", session.officeId).maybeSingle(),
  ]);
  if (!client) notFound();
  return (
    <ReceiptSheet r={{
      office: office?.name ?? "", client: client.name, amount: fromDb(m.amount_piasters), date: m.moved_on, method: m.method, note: m.note,
      about: kase ? [caseSubject(kase), caseNumberText(kase)].filter(Boolean).join(" · ") : "دفعة على الحساب",
      backHref: `/clients/${m.client_id}?tab=accounts`,
    }} />
  );
}
