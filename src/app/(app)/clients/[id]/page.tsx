// A client's page (PR 4, docs/design/ia/IAClient*): the head (name, «موكل من», «اتصل», «+ قضية جديدة له», phone / address / power of attorney),
// then three tabs: ?tab=cases (default) | accounts (قريباً: PR 5) | documents. The chat is the panel beside the page (the @chat slot): this client's
// latest session, or ?s= / ?q= (the «+ قضية جديدة له» link opens a new session with a starter sentence; nothing is sent).
import { notFound } from "next/navigation";
import { CasesTable, AccountsSoon, ClientDocs, ClientTabBar, resolveClientTab } from "@/components/clients/ClientTabs";
import { ClientHeader } from "@/components/clients/ClientHeader";
import { getClient } from "@/lib/clients";
import { todayIso } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; q?: string; s?: string; sheet?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const db = await createClient();
  const client = await getClient(db, id);
  if (!client) notFound();
  const active = resolveClientTab(sp.tab);
  const keep = { s: sp.s, q: sp.q, sheet: sp.sheet }; // stay in the address when the tab changes (the chat session, the phone sheet)

  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col px-4 sm:px-10">
      <ClientHeader client={client} />
      <ClientTabBar id={id} active={active} keep={keep} counts={{ cases: client.cases.length, documents: client.docs.length }} />
      <div className="mt-4 pb-4 sm:mt-5">
        {active === "cases" ? <CasesTable cases={client.cases} today={todayIso()} />
          : active === "accounts" ? <AccountsSoon />
          : <ClientDocs docs={client.docs} />}
      </div>
    </div>
  );
}
