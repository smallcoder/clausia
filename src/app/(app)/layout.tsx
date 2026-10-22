import { redirect } from "next/navigation";
import { CiteMain, CiteProvider } from "@/components/cite/CiteProvider";
import { AppHeader } from "@/components/shell/AppHeader";
import { undecidedPastCount } from "@/lib/hearings";
import { createClient, getSession } from "@/lib/supabase/server";

function initialsOf(name: string) {
  const w = name.replace(/^(أ\.|أستاذ|الأستاذ)\s*/u, "").trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] ?? "C").slice(0, 2)) || "C";
}

/** Shell: the v2 top bar; each page owns its width (pages 1280px of content, Home/Chat 960px, docked composer 780px); the top bar takes the same column as the page. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const db = await createClient();
  const session = await getSession(db);
  if (!session) redirect("/login");
  const [{ data: office }, alerts] = await Promise.all([
    db.from("offices").select("name").eq("id", session.officeId).single(),
    undecidedPastCount(db).catch(() => 0),
  ]);
  return (
    <CiteProvider>
      <div className="flex min-h-dvh flex-col">
        <AppHeader initials={initialsOf(session.displayName || "أ ت")} officeName={office?.name ?? ""} email={session.user.email ?? ""} alerts={alerts} />
        <CiteMain>{children}</CiteMain>
      </div>
    </CiteProvider>
  );
}
