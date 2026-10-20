import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/db/types";

/** Supabase client acting as the signed-in lawyer (RLS applies). Use in server components, actions, route handlers. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // called from a server component: the proxy refreshes the session instead
          }
        },
      },
    },
  );
}

export type Db = Awaited<ReturnType<typeof createClient>>;

/** The signed-in user and their office, or null. */
export async function getSession(db?: Db) {
  const supabase = db ?? (await createClient());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: member } = await supabase.from("office_members").select("office_id, display_name").eq("user_id", user.id).single();
  if (!member) return null;
  return { user, officeId: member.office_id, displayName: member.display_name ?? user.email ?? "" };
}
