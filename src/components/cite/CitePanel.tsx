"use client";
/**
 * The paper panel (docs/design/next/Cite{Light,Dark}.dc.html): header (paper thumb, file name, «صفحة 2 من 4 · الجملة
 * المستخدمة متعلّمة», the page control, «اقفل»), the page text on a white sheet with the sentence marked, and a footer line
 * naming the item taken from it. Desktop: an aside (floating over the page column, beside the chat panel).
 * Mobile: a bottom sheet.
 *
 * The page text is read with the lawyer's own session (loadCitePaper). The sentence is the span stored when the item was
 * extracted; an older item has none, so the same CODE matcher finds the quote (never the model). If it is not found,
 * the page opens with no mark and a small note. The mark shows only on the source page.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { loadCitePaper, type CitePaper } from "@/lib/cite/actions";
import { findSpanInPages, spanMatches, type Span } from "@/lib/quote-match";
import { useCite, useDesktop, type CiteSource } from "./context";

type Loaded = { ok: true; paper: CitePaper } | { ok: false; error: string };
/** papers already fetched in this tab (a paper's pages do not change once read) */
const papers = new Map<string, Promise<Loaded>>();
function fetchPaper(documentId: string): Promise<Loaded> {
  let p = papers.get(documentId);
  if (!p) {
    p = loadCitePaper(documentId).catch(() => ({ ok: false as const, error: "تعذّر فتح الورقة" }));
    papers.set(documentId, p);
    // only a paper that was really read is kept: a failure, or a paper whose pages are not there yet, is asked again
    void p.then((r) => { if (!r.ok || !r.paper.pages.some((t) => t.trim())) papers.delete(documentId); });
  }
  return p;
}

/** The page and span to show: the stored span if it still reads as the quote, else the code matcher, else none. */
function resolveTarget(pages: string[], a: CiteSource): { page: number; span: Span | null; lost: boolean } {
  const stored = a.start != null && a.end != null ? { start: a.start, end: a.end } : null;
  const own = pages[a.page - 1];
  if (stored && own !== undefined && spanMatches(own, stored, a.quote)) return { page: a.page, span: stored, lost: false };
  const hit = findSpanInPages(pages, a.quote, a.page);
  if (hit) return { page: hit.page, span: { start: hit.start, end: hit.end }, lost: false };
  return { page: Math.min(Math.max(a.page, 1), Math.max(pages.length, 1)), span: null, lost: !!a.quote?.trim() };
}

export function CitePanel() {
  const { active, close } = useCite();
  const desktop = useDesktop();
  if (!active) return null;
  const label = `الورقة · ${active.label}`;
  if (desktop) {
    return (
      <PanelShell label={label} close={close} modal={false}
        className="fixed bottom-6 start-10 top-25 z-50 flex w-160 flex-col overflow-hidden rounded-xl border border-border-2 bg-card shadow-card">
        <Paper key={active.id} source={active} close={close} />
      </PanelShell>
    );
  }
  return (
    <div className="fixed inset-0 z-60 flex flex-col justify-end">
      <button type="button" aria-label="اقفل الورقة" tabIndex={-1} onClick={close} className="fade-enter absolute inset-0 bg-backdrop" />
      <PanelShell label={label} close={close} modal
        className="sheet-enter relative flex h-[85dvh] flex-col overflow-hidden rounded-t-xl border-t border-border-2 bg-card shadow-pop" /* ds-allow: dvh: the sheet is 85% of the visible screen */>
        <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-card-3" />
        <Paper key={active.id} source={active} close={close} />
      </PanelShell>
    </div>
  );
}

/** The labelled box: an aside beside the page (desktop) or a modal dialog (mobile). Focus moves in when it opens. */
function PanelShell({ label, close, modal, className, children }: { label: string; close: () => void; modal: boolean; className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (!modal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [modal]);
  // modal: Tab stays inside the sheet
  const trap = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!modal || e.key !== "Tab" || !ref.current) return;
    const f = [...ref.current.querySelectorAll<HTMLElement>("button, select, a[href], [tabindex]:not([tabindex='-1'])")].filter((x) => !x.hasAttribute("disabled"));
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  const props = { ref, tabIndex: -1, "aria-label": label, onKeyDown: trap, className };
  return modal ? <div {...props} role="dialog" aria-modal="true">{children}</div> : <aside {...props}>{children}</aside>;
}

const PILL = "glass glass-icon inline-flex h-9 shrink-0 items-center gap-1.75 rounded-full px-3.75 text-base font-medium transition hover:text-text";

function Paper({ source, close }: { source: CiteSource; close: () => void }) {
  const [res, setRes] = useState<Loaded | null>(null);
  const [page, setPage] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void fetchPaper(source.documentId).then((r) => { if (live) setRes(r); });
    return () => { live = false; };
  }, [source.documentId]);

  const pages = useMemo(() => (res?.ok ? res.paper.pages : []), [res]);
  const target = useMemo(() => resolveTarget(pages, source), [pages, source]);
  const total = pages.length;
  const cur = Math.min(Math.max(page ?? target.page, 1), Math.max(total, 1));
  const marked = !!target.span && cur === target.page;
  const text = pages[cur - 1] ?? "";

  // the marked sentence is brought to the middle of the sheet (the sheet scrolls, never the page behind it)
  const body = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const sc = body.current;
    if (!sc) return;
    const m = marked ? mark.current : null;
    if (!m) { sc.scrollTop = 0; return; }
    const r = m.getBoundingClientRect(), b = sc.getBoundingClientRect();
    sc.scrollTop += r.top - b.top - (sc.clientHeight - r.height) / 2;
  }, [cur, marked, res, source]);

  const fileName = res?.ok ? res.paper.fileName : "الورقة";
  const image = res?.ok && res.paper.image;
  const sub = !res ? "بفتح الورقة…" : !res.ok ? "" : [
    total ? `صفحة ${cur} من ${total}` : "",
    marked ? "الجملة المستخدمة متعلّمة" : target.span ? `الجملة في صفحة ${target.page}` : "",
  ].filter(Boolean).join(" · ");
  const about = source.about ? `«${source.about}»` : source.label;

  return (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-border-2 px-5 py-4">
        <span aria-hidden className="flex h-9 w-7.5 shrink-0 items-center justify-center rounded-sm bg-paper-thumb text-xs font-extrabold text-paper-thumb-ink">{image ? "IMG" : "PDF"}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold leading-[normal] text-title">{fileName}</p>
          <p className="mt-0.5 text-xs leading-[normal] text-text-3">{sub || " "}</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {total > 1 ? (
            <label className={cx(PILL, "tap relative has-focus-visible:outline-3 has-focus-visible:outline-focus-key")}>
              صفحة <span className="font-num -ms-1">{cur}</span>
              <select aria-label="اختار الصفحة" value={cur} onChange={(e) => setPage(Number(e.target.value))}
                className="absolute inset-0 size-full opacity-0">
                {pages.map((_, i) => <option key={i} value={i + 1}>صفحة {i + 1}{i + 1 === target.page && target.span ? " · فيها الجملة" : ""}</option>)}
              </select>
            </label>
          ) : null}
          <button type="button" onClick={close} className={cx(PILL, "tap")}>اقفل</button>
        </div>
      </div>

      <div ref={body} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-bg p-4 lg:p-7">
        {!res ? (
          <p role="status" className="py-10 text-center text-base text-text-3">بفتح الورقة…</p>
        ) : !res.ok ? (
          <p role="alert" className="py-10 text-center text-base text-bad">{res.error}</p>
        ) : (
          <>
            {target.lost && cur === target.page ? (
              <p role="note" className="mx-auto mb-3 flex max-w-140 items-center gap-2 text-sm text-text-3">
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-gold" />مش لاقي الجملة بالظبط في الصفحة
              </p>
            ) : null}
            <div className="text-doc mx-auto max-w-140 rounded-sm bg-card px-5 py-8 text-md lg:px-12 lg:py-11 leading-[2.1] shadow-soft" lang="ar" dir="rtl">
              {text.trim() ? <PageText text={text} span={marked ? target.span : null} markRef={mark} /> : <p className="text-center font-sans text-base text-text-3">الصفحة دي فاضية، أو لسه ما اتقراتش.</p>}
            </div>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-start gap-2 border-t border-border-2 px-5 py-3 text-sm leading-[1.6] text-text-3">
        <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-gold" />
        <p className="min-w-0">{about} {marked ? "اتاخدت من الجملة المتعلّمة." : "اتاخدت من الورقة دي."}</p>
      </div>
    </>
  );
}

/**
 * The page text, line by line, as the page has it (court and law text stays verbatim). With a span, the lines that hold
 * it are in full ink and the rest in muted ink, as drawn; the sentence itself is a <mark>. Plain text nodes only.
 */
function PageText({ text, span, markRef }: { text: string; span: Span | null; markRef: { current: HTMLElement | null } }) {
  let at = 0;
  let first = true;
  return (
    <>
      {text.split("\n").map((line, i) => {
        const s = at;
        const e = at + line.length;
        at = e + 1;
        const hit = !!span && span.start < e && span.end > s;
        if (!hit) return <p key={i} className={cx("whitespace-pre-wrap", span ? "text-text-3" : "text-text")}>{line || "​"}</p>;
        const a = Math.max(0, span.start - s);
        const b = Math.min(line.length, span.end - s);
        const ref = first ? (el: HTMLElement | null) => { markRef.current = el; } : undefined;
        first = false;
        return (
          <p key={i} className="whitespace-pre-wrap text-text">
            {line.slice(0, a)}
            <mark ref={ref} className="box-decoration-clone rounded-sm bg-gold-edge py-0.5 text-title shadow-[0_0_0_2px_var(--gold-edge)]">{line.slice(a, b)}</mark>
            {line.slice(b)}
          </p>
        );
      })}
    </>
  );
}
