// Home (docs/design/*Home.dc.html): today's roll, «محتاجة قرار», and the Home composer.
import { loadHome } from "@/components/home/data";
import { HomeView } from "@/components/home/HomeView";
import { createClient, getSession } from "@/lib/supabase/server";

export default async function Home() {
  const db = await createClient();
  const [session, data] = await Promise.all([getSession(db), loadHome(db)]);
  return <HomeView data={data} displayName={session?.displayName ?? ""} />;
}
