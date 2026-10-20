/** Shared UI primitives. Small on purpose: features compose these instead of inventing new styles. */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { formatDmy, type DatePrecision } from "@/lib/dates";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink lg:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-2">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Card({ className, ...p }: ComponentProps<"section">) {
  return <section {...p} className={cx("rounded-[var(--radius)] border border-line bg-surface", className)} />;
}

export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold text-ink-2">{children}</h2>
      {actions}
    </div>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-110",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-2",
  ghost: "text-accent hover:bg-accent-soft",
  danger: "border border-danger/30 bg-danger-soft text-danger hover:brightness-95",
};

export function Button({ variant = "primary", size = "md", className, ...p }: ComponentProps<"button"> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-[15px]",
        BTN[variant],
        className,
      )}
    />
  );
}

export function LinkButton({ variant = "secondary", className, ...p }: ComponentProps<typeof Link> & { variant?: BtnVariant }) {
  return <Link {...p} className={cx("inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-4 text-[15px] font-medium transition", BTN[variant], className)} />;
}

type Tone = "neutral" | "accent" | "suggest" | "ok" | "danger" | "brass";
const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-line",
  accent: "bg-accent-soft text-accent border-accent/20",
  suggest: "bg-suggest-soft text-suggest border-suggest/25",
  ok: "bg-ok-soft text-ok border-ok/20",
  danger: "bg-danger-soft text-danger border-danger/20",
  brass: "bg-brass-soft text-brass border-brass/25",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", TONE[tone], className)}>{children}</span>;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-line-strong bg-surface-2 px-5 py-8 text-center">
      <p className="font-medium text-ink">{title}</p>
      {hint ? <p className="mt-1 text-sm text-ink-3">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
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
      {suggested ? <Badge tone="suggest">مقترح — بانتظار التأكيد</Badge> : null}
      <Badge tone={row.created_by_kind === "model" ? "accent" : "neutral"}>{row.created_by_kind === "model" ? "صاغه المساعد" : "المحامي"}</Badge>
      <span className="text-xs text-ink-3">{from}</span>
    </span>
  );
}
