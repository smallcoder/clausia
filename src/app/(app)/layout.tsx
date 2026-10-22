import { redirect } from "next/navigation";
import { CiteProvider } from "@/components/cite/CiteProvider";
import { AppHeader } from "@/components/shell/AppHeader";
import { SplitShell } from "@/components/shell/SplitShell";
import { deadlinesEnabled } from "@/lib/flags";
import { undecidedPastCount } from "@/lib/hearings";
import { createClient, getSession } from "@/lib/supabase/server";

function initialsOf(name: string) {
  const w = name.replace(/^(أ\.|أستاذ|الأستاذ)\s*/u, "").trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] ?? "C").slice(0, 2)) || "C";
}

/**
 * Shell: the chat-first split layout (docs/design/split). The top bar sits above the page only; each page owns its width
 * (1280px of content, up to its column); the chat panel is the @chat slot, always open on desktop (SplitShell).
 */
export default async function AppLayout({ children, chat }: { children: React.ReactNode; chat: React.ReactNode }) {
  const db = await createClient();
  const session = await getSession(db);
  if (!session) redirect("/login");
  const [{ data: office }, alerts] = await Promise.all([
    db.from("offices").select("name").eq("id", session.officeId).single(),
    undecidedPastCount(db).catch(() => 0),
  ]);
  const email = session.user.email ?? "";
  return (
    <CiteProvider>
      <SplitShell chat={chat} account={{ officeName: office?.name ?? "", email }}
        header={<AppHeader initials={initialsOf(session.displayName || "أ ت")} officeName={office?.name ?? ""} email={email} alerts={alerts} userId={session.user.id} holidays={deadlinesEnabled()} />}>
        {children}
      </SplitShell>
    </CiteProvider>
  );
}
