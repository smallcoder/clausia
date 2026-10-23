// A client's page (PR 4, docs/design/ia/IAClient*): the head (name, «موكل من», «اتصل», «+ قضية جديدة له», phone / address / power of attorney),
// then three tabs: ?tab=cases (default) | accounts | documents. The chat is the panel beside the page (the @chat slot): this client's
// latest session, or ?s= / ?q= (the «+ قضية جديدة له» link opens a new session with a starter sentence; nothing is sent).
import { notFound } from "next/navigation";
import { AccountsTab } from "@/components/accounts/AccountsTab";
import { MovementActions } from "@/components/accounts/MovementDialog";
import { CasesTable, ClientDocs, ClientTabBar, resolveClientTab } from "@/components/clients/ClientTabs";
import { ClientHeader } from "@/components/clients/ClientHeader";
import { caseChoiceLabel, getAccounts } from "@/lib/accounts";
import { getClient } from "@/lib/clients";
import { todayIso } from "@/lib/dates";
import { formatEgp } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; q?: string; s?: string; sheet?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const db = await createClient();
  const [client, accounts] = await Promise.all([getClient(db, id), getAccounts(db, id)]);
  if (!client || !accounts) notFound();
  const active = resolveClientTab(sp.tab);
  const today = todayIso();
  const keep = { s: sp.s, q: sp.q, sheet: sp.sheet }; // stay in the address when the tab changes (the chat session, the phone sheet)

  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col px-4 sm:px-10">
      <ClientHeader client={client}
        fees={accounts.summary.agreed !== null ? <span className="font-num">{formatEgp(accounts.summary.agreed)}</span> : accounts.summary.openFees ? "مفتوحة" : null}
        actions={active === "accounts" ? (
          <MovementActions clientId={id} clientName={client.name} today={today} suggestedCase={accounts.suggestion.id}
            cases={accounts.cases.map((c) => ({ id: c.id, label: caseChoiceLabel(c) }))}
            lastReceiptId={accounts.moves.find((m) => m.kind === "receipt" && m.review_status === "confirmed")?.id ?? null} />
        ) : undefined} />
      <ClientTabBar id={id} active={active} keep={keep} counts={{ cases: client.cases.length, documents: client.docs.length }} />
      <div className="mt-4 pb-4 sm:mt-5">
        {active === "cases" ? <CasesTable cases={client.cases} today={today} />
          : active === "accounts" ? <AccountsTab clientId={id} clientName={client.name} data={accounts} today={today} />
          : <ClientDocs docs={client.docs} />}
      </div>
    </div>
  );
}
