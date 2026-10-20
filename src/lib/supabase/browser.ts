import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/types";

/** Browser client (publishable key only). Used for auth and Storage uploads; RLS applies. */
export function createBrowserSupabase() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
