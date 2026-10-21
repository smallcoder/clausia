import { redirect } from "next/navigation";
import { AppHeader } from "@/components/shell/AppHeader";
import { createClient, getSession } from "@/lib/supabase/server";

function initialsOf(name: string) {
  const w = name.replace(/^(أ\.|أستاذ|الأستاذ)\s*/u, "").trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] ?? "C").slice(0, 2)) || "C";
}

/** Shell: the mockups' top bar; each page owns its width (chat column 820px, content ≤1120px). */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const db = await createClient();
  const session = await getSession(db);
  if (!session) redirect("/login");
  const { data: office } = await db.from("offices").select("name").eq("id", session.officeId).single();
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader initials={initialsOf(session.displayName || "أ ت")} officeName={office?.name ?? ""} email={session.user.email ?? ""} />
      <main className="flex w-full flex-1 flex-col">{children}</main>
    </div>
  );
}
