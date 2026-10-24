// The Roll became the agenda (/agenda). Old links keep working: ?view=day|week&date=d/m/yyyy go along, ?filter=undecided opens the «محتاجة قرار» tab,
// and anything else the address carried (the chat's ?s= session) is kept.
import { redirect } from "next/navigation";
import { AGENDA } from "@/components/agenda/url";

export default async function HearingsMoved({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "filter") { if (v === "undecided") q.set("tab", "decide"); continue; }
    if (typeof v === "string") q.set(k, v);
  }
  redirect(q.size ? `${AGENDA}?${q}` : AGENDA);
}
