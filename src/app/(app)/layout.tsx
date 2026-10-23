import { redirect } from "next/navigation";
import { CiteProvider } from "@/components/cite/CiteProvider";
import { AppShell } from "@/components/shell/AppShell";
import { deadlinesEnabled } from "@/lib/flags";
import { undecidedPastCount } from "@/lib/hearings";
import { loadSidebar } from "@/lib/sidebar";
import { createClient, getSession } from "@/lib/supabase/server";

function initialsOf(name: string) {
  const w = name.replace(/^(أ\.|أستاذ|الأستاذ)\s*/u, "").trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] ?? "C").slice(0, 2)) || "C";
}

/**
 * Shell: the sidebar layout (docs/design/ia). The sidebar and the chat (the @chat slot) are one glass surface on the right; the page is the column beside it
 * (AppShell). The sidebar's lists are read here, once per full render, with the lawyer's own client.
 */
export default async function AppLayout({ children, chat }: { children: React.ReactNode; chat: React.ReactNode }) {
  const db = await createClient();
  const session = await getSession(db);
  if (!session) redirect("/login");
  const [{ data: office }, alerts, side] = await Promise.all([
    db.from("offices").select("name").eq("id", session.officeId).single(),
    undecidedPastCount(db).catch(() => 0),
    loadSidebar(db).catch(() => ({ cases: [], general: [] })),
  ]);
  const displayName = session.displayName || "";
  return (
    <CiteProvider>
      <AppShell user={{ id: session.user.id, initials: initialsOf(displayName || "أ ت"), displayName, officeName: office?.name ?? "", email: session.user.email ?? "" }}
        side={side} alerts={alerts} holidays={deadlinesEnabled()} chat={chat}>
        {children}
      </AppShell>
    </CiteProvider>
  );
}
