import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { createClient, getSession } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const db = await createClient();
  const session = await getSession(db);
  if (!session) redirect("/login");
  const { data: office } = await db.from("offices").select("name").eq("id", session.officeId).single();
  return (
    <div className="min-h-dvh">
      <AppNav officeName={office?.name ?? ""} userLabel={session.user.email ?? ""} />
      <div className="lg:pr-64">
        <main className="mx-auto w-full max-w-5xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6 lg:px-10 lg:pb-12 lg:pt-12">{children}</main>
      </div>
    </div>
  );
}
