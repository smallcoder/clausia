/** Shared UI primitives. Small on purpose: features compose these instead of inventing new styles. */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ChevronLeft, Inbox, type LucideIcon } from "lucide-react";
import { SourceChip } from "@/components/cite/SourceChip";
import { formatDmy, isNumericDate, splitNumbers, type DatePrecision } from "@/lib/dates";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pt-1 lg:mb-9">
      <div className="min-w-0">
        <h1 className="text-xl font-bold leading-tight tracking-tight text-text lg:text-title">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-base leading-[1.55] text-text-3">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Inset card: rounded-lg (20px), very soft shadow, no hard border. */
export function Card({ className, ...p }: ComponentProps<"section">) {
  return <section {...p} className={cx("rounded-lg bg-card shadow-soft", className)} />;
}

/** iOS-style inset grouped list. Children are rows; hairlines are drawn between them, inset from the leading edge. */
export function GroupedList({ className, header, footer, children }: { className?: string; header?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <div className={className}>
      {header ? <div className="mb-2 px-4 text-sm leading-[1.45] font-medium text-text-4">{header}</div> : null}
      <div className="grouped overflow-hidden rounded-lg bg-card shadow-soft">{children}</div>
      {footer ? <div className="mt-2 px-4 text-sm leading-[1.45] text-text-4">{footer}</div> : null}
    </div>
  );
}

/** One row of a GroupedList: min 44px, optional link, trailing detail and chevron. */
export function ListRow({ href, title, subtitle, detail, leading, chevron = !!href, className }: {
  href?: string; title: ReactNode; subtitle?: ReactNode; detail?: ReactNode; leading?: ReactNode; chevron?: boolean; className?: string;
}) {
  const body = (
    <>
      {leading ? <span className="shrink-0 text-text-4">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-md leading-[1.6] font-medium text-text">{title}</span>
        {subtitle ? <span className="mt-0.5 block truncate text-sm leading-[1.45] text-text-4">{subtitle}</span> : null}
      </span>
      {detail ? <span className="shrink-0 text-base leading-[1.55] text-text-4">{detail}</span> : null}
      {chevron ? <ChevronLeft aria-hidden size={18} strokeWidth={1.5} className="shrink-0 text-text-4" /> : null}
    </>
  );
  const cls = cx("flex min-h-11 items-center gap-3 px-4 py-3", href && "transition-colors hover:bg-card-2 active:bg-card-2", className);
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-2.5 flex min-h-8 items-end justify-between gap-2 px-1">
      <h2 className="text-lg leading-[1.3] font-semibold text-text">{children}</h2>
      {actions}
    </div>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-primary text-on-primary hover:opacity-90 active:opacity-80",
  secondary: "bg-card-2 text-primary hover:opacity-85 active:opacity-75",
  ghost: "text-primary hover:bg-card-2",
  danger: "bg-bad-bg text-bad hover:opacity-85",
};

export function Button({ variant = "primary", size = "md", className, ...p }: ComponentProps<"button"> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex select-none items-center justify-center gap-1.5 rounded-md font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" ? "min-h-11 px-3.5 text-base leading-[1.55] lg:min-h-9" : "min-h-11 px-5 text-md leading-[1.6]",
        BTN[variant],
        className,
      )}
    />
  );
}

export function LinkButton({ variant = "secondary", className, ...p }: ComponentProps<typeof Link> & { variant?: BtnVariant }) {
  return <Link {...p} className={cx("inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-5 text-md leading-[1.6] font-semibold transition duration-150", BTN[variant], className)} />;
}

type Tone = "neutral" | "accent" | "suggest" | "ok" | "danger" | "brass";
const TONE: Record<Tone, string> = {
  neutral: "bg-card-2 text-text-3",
  accent: "bg-card-2 text-primary",
  suggest: "bg-gold-bg text-gold",
  ok: "bg-good-bg text-good",
  danger: "bg-bad-bg text-bad",
  brass: "bg-gold-bg text-gold",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-sm leading-[1.45] font-medium", TONE[tone], className)}>{children}</span>;
}

export function EmptyState({ title, hint, action, icon: Icon = Inbox }: { title: string; hint?: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-card px-6 py-10 text-center shadow-soft">
      <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-card-2 text-text-4">
        <Icon aria-hidden size={22} strokeWidth={1.5} />
      </span>
      <p className="text-md leading-[1.6] font-semibold text-text">{title}</p>
      {hint ? <p className="mt-1 max-w-sm text-base leading-[1.55] text-text-4">{hint}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** Loading placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("skeleton", className)} />;
}

/** A page-shaped loading state: large title + grouped rows. */
export function PageSkeleton({ rows = 5, cards = 1 }: { rows?: number; cards?: number }) {
  return (
    <div role="status" aria-label="جارٍ التحميل" className="fade-enter">
      <Skeleton className="mb-2 h-8 w-48" />
      <Skeleton className="mb-8 h-4 w-32" />
      {Array.from({ length: cards }).map((_, c) => (
        <div key={c} className="mb-7">
          <Skeleton className="mb-3 h-5 w-28" />
          <div className="grouped overflow-hidden rounded-lg bg-card shadow-soft">
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                <div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/5" /><Skeleton className="h-3 w-2/5" /></div>
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A date label, drawn by what it is (decided per value, never per column):
 *  - only a number, a date or a time («22/10/2026», «9:00») → numbers font, dir="ltr";
 *  - anything with a word («النهارده», «بكرة», «الأحد 25», «جلسة 22/10») → the Arabic font, dir="rtl", and each number
 *    inside is wrapped in <bdi> so it keeps its order without flipping the sentence.
 * Pass `iso` (shown as d/m/yyyy, see `formatDmy`) or a ready label in `value`. Put NO font or direction on the cell around it.
 */
export function DateText({ iso, precision = "day", value, className }: { iso?: string | null; precision?: DatePrecision; value?: string | null; className?: string }) {
  const text = value ?? formatDmy(iso, precision);
  if (isNumericDate(text)) return <span dir="ltr" className={cx("font-num text-end", className)}>{text}</span>;
  return <span dir="rtl" className={cx("font-sans", className)}>{splitNumbers(text).map((p, i) => (p.num ? <bdi key={i}>{p.text}</bdi> : p.text))}</span>;
}

/**
 * Provenance marker for any case item: who wrote it (model/lawyer), whether confirmed, and where it came from.
 * Pass the row's provenance columns.
 */
export function SourceBadge({ row, documentName, about }: {
  row: {
    review_status?: string | null; created_by_kind?: string | null; source_kind?: string | null; source_page?: number | null;
    /** with these (and `id`) a paper source is a chip that opens the paper at the sentence */
    id?: string; source_document_id?: string | null; source_quote?: string | null; source_char_start?: number | null; source_char_end?: number | null;
  };
  documentName?: string | null;
  about?: string | null;
}) {
  const suggested = row.review_status === "suggested";
  const label = `${documentName ?? "مستند"}${row.source_page ? ` · ص ${row.source_page}` : ""}`;
  const from = row.source_kind === "document" ? `${documentName ?? "مستند"}${row.source_page ? ` ص ${row.source_page}` : ""}` : row.source_kind === "chat" ? "من المحادثة" : "إدخال يدوي";
  const paper = row.source_kind === "document" && row.id && row.source_document_id;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {suggested ? <Badge tone="suggest">مقترح · بانتظار التأكيد</Badge> : null}
      <Badge tone={row.created_by_kind === "model" ? "accent" : "neutral"}>{row.created_by_kind === "model" ? "صاغه Clausia" : "المحامي"}</Badge>
      {paper ? (
        <SourceChip cite={{ id: `item:${row.id}`, documentId: row.source_document_id!, page: row.source_page ?? 1, start: row.source_char_start ?? null, end: row.source_char_end ?? null, quote: row.source_quote ?? null, label, about: about ?? null }} />
      ) : <span className="text-sm leading-4 text-text-4">{from}</span>}
    </span>
  );
}
