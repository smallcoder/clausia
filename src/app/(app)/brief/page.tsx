// Tomorrow's brief (docs/design/next/Brief*.dc.html): one card per hearing of tomorrow (circuit, court, case, last decision,
// what is required, the key fact, and in gold what is missing), a Clausia line on top built by code, and three chips
// (the chat panel beside the page is the composer). Read-only, the lawyer's RLS client, no model call: every row is built from what is on file and a row with
// nothing on file is left out. ?date=yyyy-mm-dd (or d/m/yyyy) shows another day (the reminder links to its own day).
import { BriefView } from "@/components/brief/BriefView";
import { addDaysIso, todayIso } from "@/lib/dates";
import { briefLine, dayWord, whatsappText, whatsappUrl } from "@/lib/brief/build";
import { dateParam, loadBrief } from "@/lib/brief/load";
import { arDate } from "@/components/hearings/roll-text";
import { createClient } from "@/lib/supabase/server";

export default async function Brief({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const today = todayIso();
  const tomorrow = addDaysIso(today, 1);
  const db = await createClient();
  const data = await loadBrief(db, tomorrow, dateParam(sp.date));

  const word = dayWord(data.date, today);
  const eyebrow = data.date === tomorrow ? `بكرة · ${arDate(data.date, false)}` : data.date === today ? `النهارده · ${arDate(data.date, false)}` : arDate(data.date, false);
  const line = briefLine(data.cards, word, data.fellForward ? "بكرة" : undefined);
  const memoCard = data.cards.find((c) => c.missing.some((m) => m.rule === "memo")) ?? data.cards[0];
  const memoText = memoCard ? `اكتبلي مذكرة الدفاع لقضية ${memoCard.who ?? memoCard.title}` : null;

  return (
    <BriefView
      date={data.date} word={word} eyebrow={eyebrow} cards={data.cards} line={line}
      memo={memoCard && memoText ? { href: `/cases/${memoCard.caseId}?q=${encodeURIComponent(memoText)}`, label: memoText, short: "اكتبلي المذكرة" } : null}
      whatsapp={data.cards.length ? whatsappUrl(whatsappText(data.cards, `تحضير جلسات ${word} (${arDate(data.date, false)})`)) : null}
    />
  );
}
