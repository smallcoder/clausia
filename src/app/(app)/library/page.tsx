// «المكتبة» (PR 6, docs/design/ia/IALibrary*): the templates (the shared base ones and the office's own) with search and the category chips.
// Read through RLS only; «استخدمها في قضية» opens a case with a sentence in the chat box (the chat panel beside the page is the general one here).
// The second tab, «التشريعات والأحكام», says «قريباً» until the LawMill link exists: nothing here reads or writes LawMill.
import { LibraryView } from "@/components/library/LibraryView";
import { listCases } from "@/lib/cases";
import { caseNumberText, caseSubject } from "@/lib/labels";
import { listTemplates } from "@/lib/library/list";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "المكتبة" };

export default async function Library() {
  const db = await createClient();
  const [templates, cases] = await Promise.all([listTemplates(db), listCases(db)]);
  return (
    <LibraryView
      templates={templates}
      cases={cases.map((c) => ({ id: c.id, who: c.client?.name ?? null, about: [caseSubject(c), caseNumberText(c)].filter(Boolean).join(" · ") }))}
    />
  );
}
