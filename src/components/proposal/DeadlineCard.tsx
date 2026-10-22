"use client";
/**
 * The appeal-deadlines card (docs/design/next/Deadline{Light,Dark}.dc.html): «مواعيد الطعن · <case>» with a row per period
 * (استئناف: days, last day, days left, the article chip; نقض: «بعد الاستئناف»), the note about art. 18, the reminders, and the two buttons.
 * Everything on it is computed by CODE on the server from the article text (src/lib/deadlines); the card only draws it and sends
 * the lawyer's inputs back: «مستعجل؟», «الحكم مش حضوري» + the date the judgment was served, the reminders. «حطهم في الرول» saves
 * (decideProposalAction → applyOp('add_deadline'), which recomputes); nothing is saved before that tap.
 * An article chip opens the verbatim article text in a small panel; an article LawMill does not have says so.
 */
import { CalendarDays, File, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cx } from "@/components/ui";
import { decideProposalAction } from "@/lib/assistant/actions";
import { previewDeadlinesAction } from "@/lib/deadlines/actions";
import type { DeadlineCardEntry } from "@/lib/deadlines/cards";
import { DEFAULT_REMINDERS, REMINDER_CHOICES, type ArticleRef, type DeadlineCardData, type DeadlineRowView } from "@/lib/deadlines/types";
import { formatDayLabel, formatDmy } from "@/lib/dates";
import type { Proposal } from "@/lib/proposals";

const CHIP = "tap inline-flex h-6 items-center gap-1.25 whitespace-nowrap rounded-full border border-gold-edge px-2.25 text-xs font-semibold leading-[normal] text-gold transition-colors hover:bg-gold-bg";
const PILL = "tap inline-flex h-8 items-center rounded-full px-3.25 text-sm transition";
const PILL_ON = "bg-selected font-semibold text-on-selected shadow-(--tab-shadow)";
const PILL_OFF = "border border-border-2 text-text-3 hover:text-text";

function ArticleChip({ a, onOpen }: { a: ArticleRef; onOpen: (a: ArticleRef) => void }) {
  return (
    <button type="button" onClick={() => onOpen(a)} aria-haspopup="dialog" aria-label={`افتح ${a.label}`} className={CHIP}>
      <File aria-hidden className="size-3 shrink-0" strokeWidth={1.8} />{a.label}
    </button>
  );
}

/** The verbatim article in a small modal panel (court and law text stays verbatim, in Naskh). */
function ArticlePanel({ a, onClose }: { a: ArticleRef | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (a && !d.open) d.showModal();
    if (!a && d.open) d.close();
  }, [a]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }} aria-label={a ? `نص ${a.label}` : undefined}
      className="m-auto w-[min(92vw,34rem)] rounded-xl border border-border-2 bg-card p-0 text-text shadow-pop backdrop:bg-backdrop" /* ds-allow: a modal as wide as the screen up to 34rem */>
      {a ? (
        <div className="px-5.5 py-4.5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-md font-bold text-title">{a.label}</h3>
            <button type="button" onClick={onClose} aria-label="اقفل" className="tap inline-flex size-8 items-center justify-center rounded-full text-text-3 hover:text-text"><X aria-hidden size={16} strokeWidth={2} /></button>
          </div>
          <p className="mt-0.5 text-sm text-text-3">قانون المرافعات المدنية والتجارية 13/1968 · النسخة السارية يوم صدور الحكم</p>
          {a.ok && a.text ? (
            <p className="text-doc mt-3 whitespace-pre-line rounded-md bg-card-2 px-4 py-3 text-md text-text">{a.text}</p>
          ) : (
            <p className="mt-3 rounded-md bg-card-2 px-4 py-3 text-base text-text-2">{a.note ?? "النص مش متاح"}</p>
          )}
        </div>
      ) : null}
    </dialog>
  );
}

const nDays = (n: number) => (n === 1 ? "يوم" : n === 2 ? "يومين" : n <= 10 ? `${n} أيام` : `${n} يوم`);

function DaysLeft({ row, today }: { row: DeadlineRowView; today: string }) {
  void today;
  if (row.days_left === null) return null;
  const left = row.days_left;
  const tone = left < 0 ? "text-bad" : "text-gold";
  const dot = left < 0 ? "bg-bad" : "bg-gold";
  return (
    <div className={cx("inline-flex items-center gap-1.5 text-base font-semibold", tone)}>
      <span aria-hidden className={cx("size-dot rounded-full", dot)} />
      {left < 0 ? `فات الميعاد من ${nDays(-left)}` : left === 0 ? "آخر يوم النهارده" : <>فاضل <span className="font-num">{left}</span> يوم</>}
    </div>
  );
}

function Row({ row, card, onOpen }: { row: DeadlineCardData["rows"][number]; card: DeadlineCardData; onOpen: (a: ArticleRef) => void }) {
  const afterAppeal = row.kind === "cassation" && card.rows.some((r) => r.kind === "appeal");
  const title = row.kind === "appeal" ? "استئناف" : "نقض";
  const days = row.days !== null ? <><span className="font-num">{row.days}</span> يوم</> : "راجع المادة";
  let main: React.ReactNode;
  let side: React.ReactNode = null;
  let mainTone = "text-title";
  if (afterAppeal) {
    main = "من تاريخ حكم الاستئناف";
    side = <div className="inline-flex items-center gap-1.5 text-base font-semibold text-text-3"><span aria-hidden className="size-dot rounded-full bg-text-4" />بعد الاستئناف</div>;
  } else if (row.state === "ready" && row.last_day) {
    mainTone = "text-gold";
    main = <>{formatDayLabel(row.last_day)}</>;
    side = <DaysLeft row={row} today={card.today} />;
  } else if (row.state === "need_service_date") {
    main = "محتاج تاريخ إعلان الحكم";
    side = <div className="inline-flex items-center gap-1.5 text-base font-semibold text-gold"><span aria-hidden className="size-dot rounded-full bg-gold" />في انتظارك</div>;
  } else {
    mainTone = "text-gold";
    main = "راجع المادة";
    side = <div className="inline-flex items-center gap-1.5 text-base font-semibold text-gold"><span aria-hidden className="size-dot rounded-full bg-gold" />مش قادر أحسب</div>;
  }
  return (
    <div className="border-t border-border-2 px-5.5 py-4">
      <div className="flex items-center gap-4.5">
        <div className="w-30 shrink-0">
          <div className="text-md font-bold text-text">{title}</div>
          <div className="mt-0.5 text-sm text-text-3">{days}</div>
        </div>
        <div className="min-w-0 flex-1 border-e border-border-2 pe-4.5">
          <div className="text-sm text-text-3">آخر يوم</div>
          <div className={cx("font-num mt-0.5 text-lg font-normal", mainTone)}>{main}</div>
          {row.state === "ready" && row.review_holidays ? <div className="mt-1 text-sm font-semibold text-gold">راجع الإجازات: مفيش إجازات معتمدة للسنة دي</div> : null}
          {row.state === "ready" && row.moved && row.raw_last_day ? <div className="mt-1 text-sm text-text-3">الميعاد الأصلي {formatDayLabel(row.raw_last_day)}، اتمد لأول يوم عمل بعده</div> : null}
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1.5">
          {side}
          <ArticleChip a={row.article} onOpen={onOpen} />
        </div>
      </div>
    </div>
  );
}

export function DeadlineCard({ proposal, entry }: { proposal: Proposal; entry: DeadlineCardEntry }) {
  const router = useRouter();
  const op = proposal.ops.find((o) => o.tool === "add_deadline")!;
  const [p, setP] = useState(proposal);
  const [card, setCard] = useState<DeadlineCardData | null>("card" in entry ? entry.card : null);
  const [urgent, setUrgent] = useState(card?.urgent ?? false);
  const [basis, setBasis] = useState(card?.basis ?? "judgment_date");
  const [service, setService] = useState(card?.serviceDate ? formatDmy(card.serviceDate) : "");
  const [reminders, setReminders] = useState<number[]>(card?.reminders ?? [...DEFAULT_REMINDERS]);
  const [custom, setCustom] = useState<string | null>(null);
  const [panel, setPanel] = useState<ArticleRef | null>(null);
  const [error, setError] = useState<string | null>("error" in entry ? entry.error : null);
  const [pending, start] = useTransition();

  const status = p.ops.find((o) => o.tool === "add_deadline")?.status ?? op.status;
  const done = status === "confirmed" || status === "suggested";
  if (!card) return <section className="rounded-xl border border-border-2 bg-card px-5.5 py-4 text-base text-text-2 shadow-card">{error ?? "ماقدرتش أحسب المواعيد دلوقتي"}</section>;

  const main = card.rows[0];
  const hasAppeal = card.rows.some((r) => r.kind === "appeal");
  const canSave = !done && main.state === "ready";
  const recompute = (next: { basis: typeof basis; service: string; urgent: boolean }) => {
    start(async () => {
      const r = await previewDeadlinesAction(p.id, { basis: next.basis, serviceDate: next.service, urgent: next.urgent, reminders });
      if (r.ok) { setCard(r.card); setError(null); } else setError(r.error);
    });
  };
  const toggleReminder = (d: number) => setReminders((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => b - a)));
  const addCustom = () => {
    const n = Number((custom ?? "").replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))));
    if (Number.isInteger(n) && n >= 1 && n <= 365) { setReminders((cur) => [...new Set([...cur, n])].sort((a, b) => b - a)); setCustom(null); }
  };
  const save = () => {
    start(async () => {
      const r = await decideProposalAction(p.id, { mode: "confirm", edits: { [op.op_id]: { start_basis: basis, service_date: basis === "service_date" ? service : undefined, urgent: hasAppeal ? urgent : false, reminders } } });
      if (r.ok && r.proposal) { setP(r.proposal); setError(null); router.refresh(); } else setError(r.error ?? "تعذّر الحفظ");
    });
  };

  const stock = REMINDER_CHOICES.map((c) => c.days);
  const extra = reminders.filter((d) => !stock.includes(d as 7 | 3 | 1));
  const when = card.judgmentDate === card.today ? "صدر النهارده · " : "";

  return (
    <section aria-label="مواعيد الطعن" className="overflow-hidden rounded-xl border border-border-2 bg-card shadow-card">
      <div className="flex items-center gap-3 px-5.5 py-4">
        <span aria-hidden className="mark inline-flex size-9 shrink-0 items-center justify-center rounded-md"><CalendarDays size={18} strokeWidth={2} /></span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-md font-bold text-text">مواعيد الطعن · {card.caseTitle}</div>
          <div className="mt-0.5 text-sm text-text-3">{card.judgmentLabel} · {when}{formatDayLabel(card.judgmentDate)}{card.caseNumber ? <> · {card.caseNumber}</> : null}</div>
        </div>
      </div>
      <div className="px-5.5 pb-3.5 text-sm leading-[1.8] text-text-3">
        {basis === "judgment_date"
          ? <>الميعاد محسوب من تاريخ صدور الحكم، على أساس إنه حضوري. <ArticleChip a={card.art213} onOpen={setPanel} /></>
          : <>الحكم مش حضوري: الميعاد بيبدأ من تاريخ إعلان الحكم. <ArticleChip a={card.art213} onOpen={setPanel} /></>}
      </div>

      {card.rows.map((r) => <Row key={r.kind} row={r} card={card} onOpen={setPanel} />)}

      {hasAppeal ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border-2 px-5.5 py-3.5">
          <span className="text-sm font-semibold text-text">الحكم في مادة مستعجلة؟</span>
          {[{ v: false, label: "لأ" }, { v: true, label: "أيوه" }].map((o) => (
            <button key={o.label} type="button" disabled={done || pending} aria-pressed={urgent === o.v} onClick={() => { setUrgent(o.v); recompute({ basis, service, urgent: o.v }); }}
              className={cx(PILL, urgent === o.v ? PILL_ON : PILL_OFF, "disabled:opacity-60")}>{o.label}</button>
          ))}
        </div>
      ) : null}

      <div className="border-t border-border-2 px-5.5 py-3.5 text-sm leading-[1.8] text-text-3">
        الحساب بالكود من نص المادة، مش من الموديل. لو آخر يوم جه يوم إجازة رسمية، الميعاد بيتمد لأول يوم عمل بعده <ArticleChip a={card.art18} onOpen={setPanel} />.
        {!card.art18.ok ? <> نص المادة دي لسه مش عندنا من LawMill، راجعها.</> : null}
      </div>

      {basis === "service_date" && !done ? (
        <form className="border-t border-border-2 px-5.5 py-3.5" onSubmit={(e) => { e.preventDefault(); recompute({ basis, service, urgent }); }}>
          <label htmlFor={`svc-${p.id}`} className="text-sm font-semibold text-text">تاريخ إعلان الحكم</label>
          <div className="mt-2 flex items-center gap-2">
            <input id={`svc-${p.id}`} value={service} onChange={(e) => setService(e.target.value)} inputMode="numeric" dir="ltr" placeholder="5/11/2026" autoComplete="off"
              className="font-num h-11 w-40 rounded-full border border-border bg-field px-4 text-base text-text placeholder:text-text-4" />
            <button type="submit" disabled={pending || !service.trim()} className={cx(PILL, "h-11 px-4.5", PILL_ON, "disabled:opacity-50")}>احسب</button>
          </div>
          {card.startError ? <p className="mt-2 text-sm text-bad">{card.startError}</p> : <p className="mt-2 text-sm text-text-3">اكتبه زي ما هو على ورقة الإعلان. مش هخمّنه.</p>}
        </form>
      ) : null}

      <div className="px-5.5 pb-4 pt-0.5">
        <div className="mb-2 text-sm font-semibold text-text">نبّهني قبلها بـ</div>
        <div className="flex flex-wrap gap-1.5">
          {REMINDER_CHOICES.map((c) => (
            <button key={c.days} type="button" disabled={done} aria-pressed={reminders.includes(c.days)} onClick={() => toggleReminder(c.days)}
              className={cx(PILL, reminders.includes(c.days) ? PILL_ON : PILL_OFF)}>{c.label}</button>
          ))}
          {extra.map((d) => (
            <button key={d} type="button" disabled={done} aria-pressed onClick={() => toggleReminder(d)} aria-label={`شيل تنبيه ${nDays(d)}`} className={cx(PILL, PILL_ON)}>{nDays(d)}</button>
          ))}
          {custom === null ? (
            <button type="button" disabled={done} onClick={() => setCustom("")} className={cx(PILL, PILL_OFF)}>+ تنبيه</button>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} inputMode="numeric" dir="ltr" aria-label="كام يوم قبلها" placeholder="10" autoFocus
                className="font-num h-8 w-16 rounded-full border border-border bg-field px-3 text-sm text-text placeholder:text-text-4" />
              <button type="button" onClick={addCustom} className={cx(PILL, PILL_ON)}>يوم قبلها</button>
            </span>
          )}
        </div>
      </div>

      {error ? <p className="mx-5.5 mb-3 rounded-md bg-bad-bg px-3 py-2 text-base text-bad">{error}</p> : null}

      {done ? (
        <div className="flex items-center justify-between gap-3 border-t border-border-2 px-5.5 py-4 text-base">
          <span className="font-semibold text-good">اتحطت في الرول، وهنبّهك قبلها.</span>
          {main.last_day ? <Link href={`/hearings?view=day&date=${formatDmy(main.last_day)}`} className="tap inline-flex items-center font-semibold text-text hover:underline">افتح الرول ←</Link> : null}
        </div>
      ) : (
        <div className="flex gap-2 border-t border-border-2 px-5.5 pb-4 pt-3.5">
          <button type="button" disabled={pending || !canSave} onClick={save}
            className="bg-primary-fill h-11 flex-1 rounded-full text-md font-bold transition disabled:opacity-50">حطهم في الرول</button>
          <button type="button" disabled={pending} onClick={() => { const next = basis === "service_date" ? "judgment_date" : "service_date"; setBasis(next); recompute({ basis: next, service, urgent }); }}
            className="tap h-11 rounded-full border border-border-2 px-4.5 text-base text-text-3 transition hover:text-text disabled:opacity-50">
            {basis === "service_date" ? "الحكم حضوري" : "الحكم مش حضوري"}
          </button>
        </div>
      )}
      <ArticlePanel a={panel} onClose={() => setPanel(null)} />
    </section>
  );
}
