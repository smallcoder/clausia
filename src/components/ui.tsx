/** Shared UI primitives. Small on purpose: features compose these instead of inventing new styles. */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ChevronLeft, Inbox, type LucideIcon } from "lucide-react";
import { formatDmy, type DatePrecision } from "@/lib/dates";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pt-1 lg:mb-9">
      <div className="min-w-0">
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight text-ink lg:text-title">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-callout text-ink-2">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Inset card: rounded 14px, very soft shadow, no hard border. */
export function Card({ className, ...p }: ComponentProps<"section">) {
  return <section {...p} className={cx("rounded-[var(--radius)] bg-surface shadow-1", className)} />;
}

/** iOS-style inset grouped list. Children are rows; hairlines are drawn between them, inset from the leading edge. */
export function GroupedList({ className, header, footer, children }: { className?: string; header?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <div className={className}>
      {header ? <div className="mb-2 px-4 text-caption font-medium text-ink-3">{header}</div> : null}
      <div className="grouped overflow-hidden rounded-[var(--radius)] bg-surface shadow-1">{children}</div>
      {footer ? <div className="mt-2 px-4 text-caption text-ink-3">{footer}</div> : null}
    </div>
  );
}

/** One row of a GroupedList: min 44px, optional link, trailing detail and chevron. */
export function ListRow({ href, title, subtitle, detail, leading, chevron = !!href, className }: {
  href?: string; title: ReactNode; subtitle?: ReactNode; detail?: ReactNode; leading?: ReactNode; chevron?: boolean; className?: string;
}) {
  const body = (
    <>
      {leading ? <span className="shrink-0 text-ink-3">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium text-ink">{title}</span>
        {subtitle ? <span className="mt-0.5 block truncate text-caption text-ink-3">{subtitle}</span> : null}
      </span>
      {detail ? <span className="shrink-0 text-callout text-ink-3">{detail}</span> : null}
      {chevron ? <ChevronLeft aria-hidden size={18} strokeWidth={1.5} className="shrink-0 text-ink-3" /> : null}
    </>
  );
  const cls = cx("flex min-h-11 items-center gap-3 px-4 py-3", href && "transition-colors hover:bg-surface-2 active:bg-surface-2", className);
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-2.5 flex min-h-8 items-end justify-between gap-2 px-1">
      <h2 className="text-headline font-semibold text-ink">{children}</h2>
      {actions}
    </div>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-accent text-accent-ink hover:opacity-90 active:opacity-80",
  secondary: "bg-accent-soft text-accent hover:opacity-85 active:opacity-75",
  ghost: "text-accent hover:bg-accent-soft",
  danger: "bg-danger-soft text-danger hover:opacity-85",
};

export function Button({ variant = "primary", size = "md", className, ...p }: ComponentProps<"button"> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex select-none items-center justify-center gap-1.5 rounded-[var(--radius-sm)] font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" ? "min-h-11 px-3.5 text-callout lg:min-h-9" : "min-h-11 px-5 text-body",
        BTN[variant],
        className,
      )}
    />
  );
}

export function LinkButton({ variant = "secondary", className, ...p }: ComponentProps<typeof Link> & { variant?: BtnVariant }) {
  return <Link {...p} className={cx("inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-5 text-body font-semibold transition duration-150", BTN[variant], className)} />;
}

type Tone = "neutral" | "accent" | "suggest" | "ok" | "danger" | "brass";
const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  accent: "bg-accent-soft text-accent",
  suggest: "bg-suggest-soft text-suggest",
  ok: "bg-ok-soft text-ok",
  danger: "bg-danger-soft text-danger",
  brass: "bg-brass-soft text-brass",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-caption font-medium", TONE[tone], className)}>{children}</span>;
}

export function EmptyState({ title, hint, action, icon: Icon = Inbox }: { title: string; hint?: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius)] bg-surface px-6 py-10 text-center shadow-1">
      <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-surface-2 text-ink-3">
        <Icon aria-hidden size={22} strokeWidth={1.5} />
      </span>
      <p className="text-body font-semibold text-ink">{title}</p>
      {hint ? <p className="mt-1 max-w-sm text-callout text-ink-3">{hint}</p> : null}
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
          <div className="grouped overflow-hidden rounded-[var(--radius)] bg-surface shadow-1">
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

/** d/m/yyyy, numbers kept LTR. */
export function DateText({ iso, precision = "day", className }: { iso: string | null | undefined; precision?: DatePrecision; className?: string }) {
  return <span className={cx("num", className)}>{formatDmy(iso, precision)}</span>;
}

/**
 * Provenance marker for any case item: who wrote it (model/lawyer), whether confirmed, and where it came from.
 * Pass the row's provenance columns.
 */
export function SourceBadge({ row, documentName }: {
  row: { review_status?: string | null; created_by_kind?: string | null; source_kind?: string | null; source_page?: number | null };
  documentName?: string | null;
}) {
  const suggested = row.review_status === "suggested";
  const from = row.source_kind === "document" ? `${documentName ?? "مستند"}${row.source_page ? ` ص ${row.source_page}` : ""}` : row.source_kind === "chat" ? "من المحادثة" : "إدخال يدوي";
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {suggested ? <Badge tone="suggest">مقترح · بانتظار التأكيد</Badge> : null}
      <Badge tone={row.created_by_kind === "model" ? "accent" : "neutral"}>{row.created_by_kind === "model" ? "صاغه المساعد" : "المحامي"}</Badge>
      <span className="text-xs text-ink-3">{from}</span>
    </span>
  );
}
