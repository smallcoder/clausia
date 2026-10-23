"use client";
/**
 * The top of the general chat (docs/design/split/Split*Home, SplitM*Chat): the morning brief as Clausia's first message, the line
 * under it, then «لاحظت حاجتين» with the small cards. It is NOT a saved chat message: it is drawn from the day's cached brief
 * (src/lib/morning). Every fact in it ends with its source chip (a paper opens the cite panel; «من رسالتك» / «إدخال يدوي» are labels).
 * The cards only point: «سجّل القرار» opens the record-decision sheet (its own confirm), «تجاهل» is saved per lawyer.
 */
import { CalendarDays, File, FolderClosed, Gavel, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SourceChip, SourceLabel } from "@/components/cite/SourceChip";
import { OpenHearing, RollSheet } from "@/components/hearings/RollSheet";
import { cx } from "@/components/ui";
import { formatDmy } from "@/lib/dates";
import { builtLine, clockStamp, QUIET } from "@/lib/morning/build";
import { dismissNoticeAction } from "@/lib/morning/actions";
import { noticedHeading } from "@/lib/morning/notices";
import type { Chip, ConflictNotice, HearingNotice, MorningData, Notice, SourceRef } from "@/lib/morning/types";
import { nHearings } from "@/components/hearings/roll-text";

const ICON: Record<NonNullable<Chip["icon"]>, LucideIcon> = { calendar: CalendarDays, gavel: Gavel, file: File, folder: FolderClosed };
export function ChipIcon({ icon }: { icon: Chip["icon"] }) {
  if (!icon) return null;
  const I = ICON[icon];
  return <I aria-hidden className="size-glyph-sm shrink-0" strokeWidth={1.8} />;
}

function Source({ s, className }: { s: SourceRef; className?: string }) {
  return s.kind === "paper" ? <SourceChip cite={s.cite} className={className} /> : <SourceLabel className={className}>{s.label}</SourceLabel>;
}

const BTN = "tap inline-flex h-8 items-center rounded-full px-3.5 text-sm font-semibold transition";
const GHOST = `${BTN} border border-border-2 text-text-2 hover:text-text`;

function Card({ n, kicker, gold, onIgnore, children }: { n: Notice; kicker: string; gold?: boolean; onIgnore: () => void; children: React.ReactNode }) {
  return (
    <article className="rounded-lg border border-border-2 bg-card px-3.5 py-3 shadow-card dark:bg-card-2">
      <p className={cx("text-xs font-semibold leading-[normal]", gold ? "text-gold" : "text-text-3")}>{kicker}</p>
      {children}
      <div className="mt-2.5 flex items-center gap-1.5">
        {n.kind === "hearing_decision" ? (
          <OpenHearing h={n.hearing} label={`سجّل قرار جلسة ${n.title} يوم ${formatDmy(n.hearing.hearing_date)}`} className={`${BTN} bg-primary-fill hover:opacity-90`}>سجّل القرار</OpenHearing>
        ) : null}
        <button type="button" onClick={onIgnore} className={GHOST}>تجاهل</button>
      </div>
    </article>
  );
}

function HearingCard({ n, onIgnore }: { n: HearingNotice; onIgnore: () => void }) {
  return (
    <Card n={n} kicker={n.title} gold onIgnore={onIgnore}>
      <p className="mt-0.75 text-base leading-[1.65] text-text">{n.text}</p>
      {n.source ? <p className="mt-1.5"><Source s={n.source} /></p> : null}
    </Card>
  );
}

function ConflictCard({ n, onIgnore }: { n: ConflictNotice; onIgnore: () => void }) {
  return (
    <Card n={n} kicker={n.title} onIgnore={onIgnore}>
      <p className="mt-0.75 text-base leading-[1.65] text-text">{n.text}</p>
      {n.quote ? <p className="mt-1 line-clamp-2 text-sm leading-[1.6] text-text-3" dir="auto">«{n.quote}»</p> : null}
      <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold text-text-2">شوف الورقتين:</span>
        {n.sources.map((s, i) => <Source key={i} s={s} />)}
      </p>
    </Card>
  );
}

/** «صباح الخير، أستاذ تجريبي» → two lines (the comma ends the first) */
function Greeting({ text }: { text: string }) {
  const at = text.indexOf("، ");
  return at < 0 ? <>{text}</> : <>{text.slice(0, at + 1)}<br />{text.slice(at + 2)}</>;
}

export function MorningBlock({ data }: { data: MorningData }) {
  const { brief, moreUndecided, today, greeting } = data;
  const router = useRouter();
  const [, start] = useTransition();
  // a dismissed card goes at once (and stays gone if the save worked); the refresh then brings the next one in
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const id = (n: Notice) => `${n.kind}:${n.key}`;
  const notices = data.notices.filter((n) => !hidden.has(id(n)));
  function ignore(n: Notice) {
    setHidden((s) => new Set(s).add(id(n)));
    start(async () => {
      const r = await dismissNoticeAction(n.kind, n.key);
      if (!r.ok) setHidden((s) => { const x = new Set(s); x.delete(id(n)); return x; });
      router.refresh();
    });
  }
  const line = builtLine(brief);
  const stamp = clockStamp(brief.builtAt);
  return (
    <RollSheet today={today}>
      <div className="flex flex-col gap-4">
        <p className="text-center text-xs leading-[normal] text-text-4">النهارده · <span className="num font-num">{stamp.time}</span> {stamp.period}</p>
        {/* the phone has no page beside the chat, so the greeting is on top of it (the desktop page carries it) */}
        <h1 className="text-xl font-bold leading-[1.2] text-title xl:hidden"><Greeting text={greeting} /></h1>

        <div className="min-w-0 text-md leading-[1.9] text-text">
          {brief.empty ? <p>{QUIET}</p> : brief.sentences.map((s, i) => (
            <p key={i} className={i ? "mt-1" : undefined}>
              {s.parts.map((p, j) => (p.gold ? <span key={j} className="font-semibold text-gold">{p.text}</span> : <span key={j}>{p.text}</span>))}
              {s.sources.map((src, k) => <Source key={k} s={src} className="ms-1 align-[2px]" />)}
            </p>
          ))}
          {line ? <p className="mt-1 text-xs leading-[normal] text-text-4">{line}</p> : null}
        </div>

        {notices.length ? (
          <section aria-label="لاحظت" className="flex flex-col gap-2.5">
            <h2 className="text-sm font-bold leading-[normal] text-title">{noticedHeading(notices.length)}</h2>
            {notices.map((n) => (n.kind === "hearing_decision" ? <HearingCard key={id(n)} n={n} onIgnore={() => ignore(n)} /> : <ConflictCard key={id(n)} n={n} onIgnore={() => ignore(n)} />))}
            {moreUndecided > 0 ? (
              <Link href="/hearings?filter=undecided" className="tap inline-flex w-fit items-center text-sm font-semibold text-text-2 hover:text-text">
                وفيه {nHearings(moreUndecided)} كمان فاتت من غير قرار ←
              </Link>
            ) : null}
          </section>
        ) : null}
      </div>
    </RollSheet>
  );
}
