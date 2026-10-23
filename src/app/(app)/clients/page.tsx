// The clients list (PR 4, docs/design/ia/IAClient*): the title row (the title and two real numbers) and one solid table: name, phone, number of
// cases, next hearing (soonest first). A row opens the client's page. There is no composer here: the chat panel beside the page asks and adds
// (a new client is a card in the chat, saved only on the lawyer's tap).
import { CasesHero } from "@/components/caselist/CasesHero";
import { ClientListRow, ClientsHeader } from "@/components/clients/ClientsList";
import { listClients } from "@/lib/clients";
import { todayIso } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export default async function ClientsPage() {
  const db = await createClient();
  const rows = await listClients(db);
  const today = todayIso();
  const running = rows.reduce((n, r) => n + r.running, 0);

  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col px-4 sm:px-10">
      <CasesHero
        eyebrow="كل موكلين المكتب"
        title="الموكلين"
        stats={[
          { value: rows.length, label: "موكل", mobileLabel: "موكل عندك" },
          { value: running, label: "قضية متداولة", mobileLabel: "قضايا متداولة", href: "/cases" },
        ]}
      />

      {rows.length ? (
        <section aria-label="الموكلين" className="mt-1 overflow-hidden rounded-xl border border-border-2 bg-card px-4.5 shadow-card sm:mt-4.5 md:px-0">
          <ClientsHeader />
          <ul>{rows.map((c) => <ClientListRow key={c.id} c={c} today={today} />)}</ul>
        </section>
      ) : (
        <section className="mt-1 rounded-xl border border-border-2 bg-card px-6 py-12 text-center shadow-card sm:mt-4.5">
          <h2 className="text-lg font-bold text-title">لسه مفيش موكلين</h2>
          <p className="mx-auto mt-1.5 max-w-md text-base leading-7 text-text-3">احكي لـ Clausia في الشات عن الموكل، أو ارفع الصحيفة، وهي تجهّز الملف وتستنى تأكيدك.</p>
        </section>
      )}
    </div>
  );
}
