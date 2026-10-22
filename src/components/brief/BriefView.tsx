/**
 * The brief page, drawn to docs/design/next/Brief*.dc.html: the 1280 column; an eyebrow, the big title (not the list-page
 * title row), at the far end «بيوصلك كل يوم الساعة 8 بالليل» + «الإعدادات»; a Clausia line; the cards, 3 to a row on desktop
 * and one on a phone; the chips and the composer at the bottom. A row with nothing on file is not drawn.
 */
import type { ReactNode } from "react";
import type { BriefCard, BriefLine } from "@/lib/brief/build";
import { BriefComposer, BriefSeen, BriefSettings } from "./BriefClient";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-2 flex gap-2.5 text-base leading-[1.6]">
      <span className="w-18.5 shrink-0 text-text-3 sm:w-21.5">{label}</span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  );
}

function Card({ c }: { c: BriefCard }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4.5 shadow-card sm:px-6 sm:py-5.5">
      <div className="flex items-center gap-4">
        {c.circuit ? (
          <div className="w-10 shrink-0 text-center leading-none">
            <div className="font-num text-page-title font-extralight text-gold sm:text-2xl">{c.circuit}</div>
            <div className="mt-0.75 text-xs text-text-4">دائرة</div>
          </div>
        ) : null}
        <div className={`min-w-0 flex-1 ${c.circuit ? "border-s border-border ps-4" : ""}`}>
          {c.meta ? <div className="text-sm text-text-3">{c.meta}</div> : null}
          <h2 className="mt-0.75 text-base font-bold leading-[1.45] sm:text-md">{c.title}</h2>
        </div>
      </div>
      {c.lastDecision || c.required || c.keyFact ? (
        <div className="mt-3 border-t border-border pt-1.5">
          {c.lastDecision ? <Row label="آخر قرار">{c.lastDecision}</Row> : null}
          {c.required ? <Row label="المطلوب"><b className="font-semibold">{c.required}</b></Row> : null}
          {c.keyFact ? <Row label="أهم واقعة">{c.keyFact}</Row> : null}
        </div>
      ) : null}
      {c.missing.map((m) => (
        <div key={m.line} className="mt-2.5 flex items-center gap-1.75 text-sm font-semibold text-gold">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-gold" />{m.line}
        </div>
      ))}
    </article>
  );
}

function Pieces({ parts }: { parts: BriefLine["long"] }) {
  return <>{parts.map((p, i) => (p.gold ? <span key={i} className="font-semibold text-gold">{p.text}</span> : <span key={i}>{p.text}</span>))}</>;
}

export function BriefView({ date, word, eyebrow, cards, line, memo, whatsapp }: {
  date: string;
  word: string;
  eyebrow: string;
  cards: BriefCard[];
  line: BriefLine;
  memo: { href: string; label: string; short: string } | null;
  whatsapp: string | null;
}) {
  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col px-4 pt-3 sm:px-10 sm:pt-6">
      <header className="flex items-end justify-between gap-6 px-1 leading-[normal] sm:px-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-3">{eyebrow}</div>
          <h1 className="mt-1.5 text-xl font-bold leading-[1.2] text-title sm:text-2xl">تحضير جلسات {word}</h1>
        </div>
        <div className="hidden shrink-0 items-center gap-2.5 sm:flex">
          <span className="text-sm text-text-3">بيوصلك كل يوم الساعة 8 بالليل</span>
          <BriefSettings />
        </div>
      </header>

      <div className="mt-3 flex gap-2.5 px-1 sm:mt-4.5 sm:gap-3 sm:px-2">
        <span aria-hidden className="mark font-num inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-xs font-extrabold sm:size-mark-lg sm:text-base">C</span>
        <p className="mt-px min-w-0 flex-1 text-base leading-[1.75] sm:mt-0.75 sm:text-md sm:leading-[1.8]">
          <span className="sm:hidden"><Pieces parts={line.short} /></span>
          <span className="hidden sm:inline"><Pieces parts={line.long} /></span>
        </p>
      </div>

      {cards.length ? (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:mt-5.5 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => <Card key={c.hearingId} c={c} />)}
        </div>
      ) : null}

      <div className="min-h-6 flex-1" />
      <BriefSeen date={date} />
      <BriefComposer date={date} dayWord={word} memo={memo} whatsapp={whatsapp} />
    </div>
  );
}
