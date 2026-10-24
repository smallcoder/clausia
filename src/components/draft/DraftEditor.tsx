"use client";
/**
 * The draft editor (docs/design/ia/IADraft*, PR 7): the draft opens as a paper the lawyer edits like Word: paragraphs and headings, bold, right to left,
 * on the office's own paper (the header and footer of his Word file) when the office has one. It saves as he types (a new version each time: «النسخ»),
 * and the same paper shows an old version read only, with «استرجعها».
 *  - Quoted text (an article, a ruling, a passage from a paper) is a locked box: «مبيتعدلش». The lawyer marks a selection as a quotation with «اقتباس».
 *  - A draft made from the lawyer's OWN Word template keeps that file's formatting in the export, so only its lawyer sections (the grounds, the requests)
 *    are edited here; the rest of its text is filled from the case.
 *  - A Word file opened as a draft says what the reader could not carry over (tables, pictures, footnotes).
 * The page's tracked changes («اسأل Clausia») are PR 7b; this file is the part that edits and versions.
 */
import { ChevronRight, Bold, Check, Download, FileText, Heading2, History, Lock, LockOpen, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDraft } from "@/components/chat/draft";
import { OfficeStyleUpload } from "@/components/library/OfficeStyleUpload";
import { cx } from "@/components/ui";
import { askKey, cleanLabel } from "@/lib/assistant/ask";
import { decideProposalAction } from "@/lib/assistant/actions";
import { fitChange } from "@/lib/draft/changes";
import { freshId, isQuoteBlock, lockMarks, mergeBlocks, normalizeBlock, setLock, splitBlock } from "@/lib/draft/model";
import type { PendingChange } from "@/lib/draft/pending";
import type { VersionRow } from "@/lib/draft/store";
import { restoreVersionAction, loadVersionAction, saveDraftAction } from "@/lib/draft/actions";
import type { DraftBlock, DraftBody } from "@/lib/library/types";
import type { DraftFull } from "@/lib/library/list";
import type { OfficeStyle } from "@/lib/word/office-style";
import { Editable, type EditableHandle } from "./Editable";
import { blockHtml } from "./editor-dom";
import { LetterheadBottom, LetterheadTop } from "./Letterhead";
import { ago, stamp } from "./time";
import { AddedBlock, TrackedText, type Decide, type Fitted } from "./Tracked";
import { VersionsPanel } from "./VersionsPanel";

/** what the editor needs from the server; the real actions by default (a preview page passes stand-ins) */
export interface EditorActions {
  save: (draftId: string, body: DraftBody, expected: string | null) => Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }>;
  restore: (draftId: string, versionId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  loadVersion: (draftId: string, versionId: string) => Promise<{ ok: true; body: DraftBody } | { ok: false; error: string }>;
  /** ✓ / × on a proposed change: the same decision as the chat card's (nothing in the draft changes before a ✓) */
  decide: (proposalId: string, mode: "confirm" | "reject", opIds: string[]) => Promise<{ ok: true } | { ok: false; error: string }>;
}
const REAL: EditorActions = {
  save: saveDraftAction, restore: restoreVersionAction, loadVersion: loadVersionAction,
  decide: async (id, mode, opIds) => { const r = await decideProposalAction(id, { mode, opIds }); return r.ok ? { ok: true } : { ok: false, error: r.error ?? "تعذّر الحفظ" }; },
};

const AUTOSAVE_MS = 3000;
const jsonOf = (blocks: DraftBlock[]) => JSON.stringify({ version: 1, blocks });
const DROPPED: Record<string, string> = { tables: "الجداول", images: "الصور والأشكال", footnotes: "الهوامش السفلية" };

export interface DraftEditorProps {
  draft: DraftFull;
  caseId: string;
  clientName: string | null;
  /** the office's paper (null = the office has none yet) */
  style: OfficeStyle | null;
  versions: VersionRow[];
  /** he came here from «تنزيل Word» with no office paper yet (the highlight on the ask) */
  word?: boolean;
  /** the changes Clausia proposed and he has not decided (PR 7b), drawn as tracked changes */
  changes?: PendingChange[];
  actions?: EditorActions;
}

export function DraftEditor({ draft, caseId, clientName, style, versions, word = false, changes = [], actions = REAL }: DraftEditorProps) {
  const router = useRouter();
  const { addChip, removeChip, chips, focusComposer } = useDraft();
  const downloadHref = `/api/drafts/${draft.id}/docx`;
  const labels = useMemo(() => new Map(draft.fill.missing.map((m) => [m.key, m.label])), [draft.fill.missing]);
  const own = draft.own_template;

  // ---- the working copy and what is saved
  const [blocks, setBlocks] = useState<DraftBlock[]>(draft.body.blocks);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const base = useRef({ updatedAt: draft.updated_at, json: jsonOf(draft.body.blocks), blocks: draft.body.blocks });
  const [status, setStatus] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [adopt, setAdopt] = useState(false);
  const [savedAt, setSavedAt] = useState(() => Date.parse(draft.updated_at));
  const [now, setNow] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const again = useRef(false);

  const dirty = () => jsonOf(blocksRef.current) !== base.current.json;

  const save = useCallback(async (): Promise<boolean> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (saving.current) { again.current = true; return false; }
    if (!dirty()) { setStatus("saved"); return true; }
    saving.current = true;
    setStatus("saving");
    const sent = blocksRef.current;
    const r = await actions.save(draft.id, { version: 1, blocks: sent }, base.current.updatedAt);
    saving.current = false;
    if (!r.ok) {
      setStatus("error");
      setError(r.error);
      if (/اتغيّرت من مكان تاني/.test(r.error)) setConflict(true);
      return false;
    }
    base.current = { updatedAt: r.updatedAt || base.current.updatedAt, json: jsonOf(sent), blocks: sent };
    setSavedAt(Date.now());
    setError(null);
    if (dirty() || again.current) { again.current = false; setStatus("dirty"); timer.current = setTimeout(() => void save(), 600); return true; }
    setStatus("saved");
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.id, actions]);

  // what changed on screen: saved soon (not while a conflict is waiting for the lawyer)
  useEffect(() => {
    if (conflict) return;
    if (!dirty()) { if (status === "dirty") setStatus("saved"); return; }
    if (status === "saved" || status === "error") setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, conflict]);

  // leaving with unsaved words: save now when the tab is hidden, and warn when the page is closed
  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden" && dirty() && !conflict) void save(); };
    const warn = (e: BeforeUnloadEvent) => { if (dirty()) e.preventDefault(); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("beforeunload", warn);
    return () => { document.removeEventListener("visibilitychange", hide); window.removeEventListener("beforeunload", warn); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflict, save]);

  // the draft changed somewhere else (an accepted change, a restored version): taken in when nothing of his is waiting; else he decides
  useEffect(() => {
    if (draft.updated_at === base.current.updatedAt) return;
    if (dirty() && !adopt) { setConflict(true); return; }
    base.current = { updatedAt: draft.updated_at, json: jsonOf(draft.body.blocks), blocks: draft.body.blocks };
    setBlocks(draft.body.blocks);
    setSavedAt(Date.parse(draft.updated_at));
    setConflict(false); setAdopt(false); setError(null); setStatus("saved");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.updated_at, adopt]);

  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);

  // ---- editing
  const handles = useRef(new Map<string, EditableHandle>());
  const register = useCallback((id: string, h: EditableHandle | null) => { if (h) handles.current.set(id, h); else handles.current.delete(id); }, []);
  const [active, setActive] = useState<string | null>(null);
  const [sel, setSel] = useState<{ id: string; from: number; to: number; lock: boolean } | null>(null);
  const [focusAt, setFocusAt] = useState<{ id: string; at: number } | null>(null);

  const replace = (id: string, next: DraftBlock) => setBlocks((cur) => cur.map((b) => (b.id === id ? next : b)));

  useEffect(() => {
    if (!focusAt) return;
    handles.current.get(focusAt.id)?.focus(focusAt.at);
    setFocusAt(null);
  }, [focusAt, blocks]);

  // the selection, for the toolbar (is there a selection to make bold / a quotation?)
  useEffect(() => {
    const on = () => {
      const s = document.getSelection();
      const host = s?.anchorNode ? (s.anchorNode.nodeType === 1 ? (s.anchorNode as Element) : s.anchorNode.parentElement)?.closest("[data-block-id]") : null;
      const id = host?.getAttribute("data-block-id");
      const o = id ? handles.current.get(id)?.offsets() : null;
      if (!id || !o) { setSel(null); return; }
      const b = blocksRef.current.find((x) => x.id === id);
      setSel({ id, from: o.from, to: o.to, lock: !!b && lockMarks(b).some((m) => m.s < o.to && m.e > o.from) });
    };
    document.addEventListener("selectionchange", on);
    return () => document.removeEventListener("selectionchange", on);
  }, []);

  function split(id: string, cur: DraftBlock, at: number) {
    const parts = splitBlock(cur, at);
    if (!parts) return;
    const body = { version: 1 as const, blocks: blocksRef.current };
    const right = { ...parts[1], id: freshId(body) };
    setBlocks((all) => all.flatMap((b) => (b.id === id ? [parts[0], right] : [b])));
    setFocusAt({ id: right.id, at: 0 });
  }
  function mergePrev(id: string, cur: DraftBlock) {
    const i = blocksRef.current.findIndex((b) => b.id === id);
    const prev = blocksRef.current[i - 1];
    if (i <= 0 || !prev) return;
    const merged = mergeBlocks(prev, cur);
    if (!merged) return;
    const at = prev.text.length;
    setBlocks((all) => all.flatMap((b) => (b.id === prev.id ? [merged] : b.id === id ? [] : [b])));
    setFocusAt({ id: prev.id!, at });
  }
  const setKind = (id: string, t: "h" | "p") => setBlocks((all) => all.map((b) => (b.id === id && (b.t === "h" || b.t === "p") ? ({ ...b, t } as DraftBlock) : b)));
  const unquote = (id: string) => setBlocks((all) => all.map((b) => (b.id === id ? setLock(b, 0, b.text.length, null) : b)));

  const current = sel ? blocks.find((b) => b.id === sel.id) : null;
  const canBold = !!sel && sel.to > sel.from && (!own || current?.t === "lawyer");
  const canQuote = !!sel && sel.to > sel.from && !own;
  const canHeading = !!current && (current.t === "h" || current.t === "p") && !own;
  const act = (f: (h: EditableHandle) => void) => { const h = sel ? handles.current.get(sel.id) : active ? handles.current.get(active) : null; if (h) f(h); };

  // ---- «اسأل Clausia»: the open draft is context for the chat while the editor is open (the chip is made again after a message uses it up), and a selection
  // can be asked about on its own. The chip is DATA for the model (it reads the draft itself with get_draft); nothing is sent until the lawyer sends.
  const chipKey = askKey({ kind: "draft", id: draft.id });
  const hasChip = chips.some((c) => askKey(c) === chipKey);
  useEffect(() => { if (!hasChip) addChip({ kind: "draft", id: draft.id, label: cleanLabel(draft.title) }); }, [hasChip, addChip, draft.id, draft.title]);
  useEffect(() => () => removeChip(chipKey), [removeChip, chipKey]);
  const canAsk = !!sel && sel.to > sel.from && !!current;
  function askAboutSelection() {
    if (!sel || !current || sel.to <= sel.from) return;
    addChip({ kind: "draft", id: draft.id, label: cleanLabel(current.text.slice(sel.from, sel.to)), field: sel.id });
    focusComposer();
  }

  // ---- the changes Clausia proposed, drawn in the paper (each one fits the draft as it is NOW, or says it no longer does)
  const [decideBusy, setDecideBusy] = useState(false);
  const [decideError, setDecideError] = useState<string | null>(null);
  const tracked = useMemo(() => {
    const body = { version: 1 as const, blocks };
    const replaceBy = new Map<string, Fitted[]>();
    const addAfter = new Map<string, PendingChange[]>();
    const stale: { c: PendingChange; reason: string }[] = [];
    const taken = new Map<string, [number, number][]>();
    for (const c of changes) {
      const fit = fitChange(body, c.args, c.cite);
      if (!fit.ok) { stale.push({ c, reason: fit.reason }); continue; }
      if (c.args.kind === "add") { addAfter.set(c.args.block, [...(addAfter.get(c.args.block) ?? []), c]); continue; }
      const used = taken.get(c.args.block) ?? [];
      if (used.some(([a, b]) => fit.from! < b && fit.to! > a)) { stale.push({ c, reason: "بيتداخل مع تعديل تاني على نفس الكلام" }); continue; }
      taken.set(c.args.block, [...used, [fit.from!, fit.to!]]);
      replaceBy.set(c.args.block, [...(replaceBy.get(c.args.block) ?? []), { c, from: fit.from!, to: fit.to! }]);
    }
    const fitting = [...[...replaceBy.values()].flat().map((x) => x.c), ...[...addAfter.values()].flat()];
    return { replaceBy, addAfter, stale, fitting };
  }, [changes, blocks]);

  /** ✓ or ×: what the lawyer has typed is saved first, then the same decision as the chat card's; the page then shows the new body */
  const decide: Decide = async (c, mode) => {
    setDecideError(null);
    setDecideBusy(true);
    if (mode === "confirm" && dirty() && !(await save())) { setDecideBusy(false); setDecideError("احفظ شغلك الأول: في كلام لسه ما اتحفظش"); return; }
    const r = await actions.decide(c.proposalId, mode, [c.opId]);
    setDecideBusy(false);
    if (!r.ok) { setDecideError(r.error); return; }
    router.refresh();
  };
  async function acceptAll() {
    setDecideError(null);
    setDecideBusy(true);
    if (dirty() && !(await save())) { setDecideBusy(false); setDecideError("احفظ شغلك الأول: في كلام لسه ما اتحفظش"); return; }
    // card by card (the changes that still fit only), each card all or nothing
    const byCard = new Map<string, string[]>();
    for (const c of tracked.fitting) byCard.set(c.proposalId, [...(byCard.get(c.proposalId) ?? []), c.opId]);
    for (const [id, ops] of byCard) {
      const r = await actions.decide(id, "confirm", ops);
      if (!r.ok) { setDecideBusy(false); setDecideError(r.error); router.refresh(); return; }
    }
    setDecideBusy(false);
    router.refresh();
  }

  // ---- the history
  const [showVersions, setShowVersions] = useState(false);
  const [preview, setPreview] = useState<{ v: VersionRow; body: DraftBody } | null>(null);
  const [vBusy, setVBusy] = useState(false);
  const [vError, setVError] = useState<string | null>(null);

  async function openVersion(v: VersionRow) {
    setVError(null);
    if (versions[0]?.id === v.id) { setPreview(null); return; }
    setVBusy(true);
    const r = await actions.loadVersion(draft.id, v.id);
    setVBusy(false);
    if (r.ok) setPreview({ v, body: r.body }); else setVError(r.error);
  }
  async function restore(v: VersionRow) {
    setVError(null);
    setVBusy(true);
    if (dirty() && !(await save())) { setVBusy(false); setVError("احفظ شغلك الأول: في كلام لسه ما اتحفظش"); return; }
    const r = await actions.restore(draft.id, v.id);
    setVBusy(false);
    if (!r.ok) { setVError(r.error); return; }
    setPreview(null);
    setAdopt(true);
    router.refresh();
  }
  const newest = versions[0];
  const undoAccept = newest?.kind === "accept" && versions[1] ? () => void restore(versions[1]) : null;

  // ---- drawing
  const shown = preview ? preview.body.blocks : blocks;
  const readOnly = !!preview;
  const baseText = new Map(base.current.blocks.flatMap((b) => (b.t === "lawyer" ? [[b.key, b.text] as const] : [])));
  const editableBlock = (b: DraftBlock) => !readOnly && (!own || b.t === "lawyer");
  const meta = status === "saving" ? "بحفظ…" : status === "dirty" ? "فيه تعديل لسه ما اتحفظش" : status === "error" ? "ما اتحفظش" : `اتحفظت ${now ? ago(now - savedAt) : ""}`.trim();
  const imported = draft.fill.imported;

  const tool = "tap inline-flex size-10 items-center justify-center rounded-full border border-border-2 text-text-2 transition hover:text-text disabled:opacity-40";
  const toolOn = "border-gold-edge bg-gold-bg text-gold-text-small";
  const pill = "tap inline-flex h-11 items-center gap-2 rounded-full border border-border-2 px-4 text-base font-semibold text-text-2 transition hover:text-text";

  return (
    <div className="space-y-4 pb-4">
      <div>
        <nav aria-label="مكانك" className="flex flex-wrap items-center gap-1 text-sm text-text-3">
          <Link href="/cases" className="hover:text-text">القضايا</Link>
          <ChevronRight aria-hidden size={12} strokeWidth={2} className="rotate-180" />
          <Link href={`/cases/${caseId}`} className="hover:text-text">{clientName ?? "القضية"}</Link>
          <ChevronRight aria-hidden size={12} strokeWidth={2} className="rotate-180" />
          <Link href={`/cases/${caseId}?tab=memos`} className="hover:text-text">المذكرات</Link>
        </nav>
        <div className="mt-1.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-title">{draft.title}</h1>
            <p className="mt-1 text-sm text-text-3" aria-live="polite">
              {draft.template_name === "ملف Word" ? "مسودة من ملف Word" : "مسودة"} · <span className={cx(status === "error" && "font-semibold text-bad")}>{meta}</span>
              {draft.needs_lawyer_review ? " · الصيغة لسه محتاجة مراجعة محامٍ" : ""}
              {tracked.fitting.length ? <> · <span className="font-semibold text-gold-text-small">{tracked.fitting.length === 1 ? "تعديل مقترح" : `${tracked.fitting.length} ${tracked.fitting.length <= 10 ? "تعديلات" : "تعديل"} مقترحة`}</span></> : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/settings/office-style" className={pill}><FileText aria-hidden size={15} strokeWidth={1.8} />ورق المكتب</Link>
            <button type="button" onClick={() => setShowVersions((v) => !v)} aria-expanded={showVersions} className={cx(pill, showVersions && toolOn)}><History aria-hidden size={15} strokeWidth={1.8} />النسخ</button>
            <button type="button" onClick={() => void acceptAll()} disabled={!tracked.fitting.length || decideBusy || !!preview} className={cx(pill, "disabled:opacity-50")}><Check aria-hidden size={15} strokeWidth={1.8} />اقبل الكل</button>
            <a href={downloadHref} onClick={(e) => { if (dirty()) { e.preventDefault(); void save().then(() => { window.location.href = downloadHref; }); } }}
              className="bg-primary-fill inline-flex h-11 items-center gap-2 rounded-full px-5 text-base font-bold transition"><Download aria-hidden size={16} strokeWidth={2} />نزّلها Word</a>
          </div>
        </div>
      </div>

      {!style && !own ? (
        <section id="word" aria-label="ورق المكتب" className={word ? "rounded-xl border border-gold bg-card px-5 py-5 shadow-card sm:px-8" : "rounded-xl border border-gold-edge bg-card px-5 py-5 shadow-card sm:px-8"}>
          <h2 className="text-md font-bold text-title">عشان تنزّل المسودة على ورق مكتبك</h2>
          <p className="mt-1.5 max-w-2xl text-base leading-7 text-text-3">
            ارفع أي ملف Word من شغلك (مذكرة أو خطاب أو صحيفة قديمة). Clausia بتاخد منه الرأس والتذييل والخط والهوامش وتطبقهم على كل مسودة وعلى الإيصالات. نص الملف نفسه مش بيتنقل. تقدر تغيّره بعدين من «ورق المكتب» في قايمة الحساب.
          </p>
          <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-1">
            <OfficeStyleUpload />
            <a href={`${downloadHref}?plain=1`} className="tap inline-flex min-h-11 items-center text-base font-semibold text-text-2 underline underline-offset-4 hover:text-text">نزّلها من غير ورق المكتب</a>
          </div>
        </section>
      ) : null}

      {own ? <p className="rounded-lg border border-gold-edge bg-gold-bg px-4 py-2.5 text-base text-text">المسودة دي من صيغة ملف Word بتاعك: الملف بيحتفظ بتنسيقه في Word، فهنا بتكتب الأسباب والطلبات بس، وباقي النص بيتملا من القضية.</p> : null}
      {imported ? (
        <p className="rounded-lg border border-border-2 bg-card px-4 py-2.5 text-base text-text-2">
          اتفتحت من ملف Word «{imported.file_name}».{imported.dropped.length ? ` اللي ما اتنقلش: ${imported.dropped.map((d) => DROPPED[d]).join("، ")}. ضيفه بإيدك لو محتاجه.` : ""}
        </p>
      ) : null}
      {conflict ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-gold-edge bg-gold-bg px-4 py-2.5 text-base text-text">
          <span className="min-w-0 flex-1 basis-60">المسودة اتغيّرت من مكان تاني (تعديل اتقبل أو نسخة اتسترجعت)، وعندك كلام لسه ما اتحفظش. الحفظ واقف لحد ما تختار.</span>
          <button type="button" onClick={() => { setAdopt(true); router.refresh(); }} className="tap inline-flex h-9 items-center rounded-full bg-selected px-4 text-sm font-semibold text-on-selected">حمّل آخر نسخة (وسيب اللي كتبته)</button>
        </div>
      ) : error && !conflict ? <p role="alert" className="rounded-lg bg-bad-bg px-4 py-2.5 text-base text-bad">{error}</p> : null}

      {decideError ? <p role="alert" className="rounded-lg bg-bad-bg px-4 py-2.5 text-base text-bad">{decideError}</p> : null}
      {tracked.stale.length ? (
        <section aria-label="تعديلات ما بقتش مناسبة" className="rounded-lg border border-border-2 bg-card px-4 py-3">
          <p className="text-base font-semibold text-text">فيه تعديلات مقترحة ما بقتش مناسبة للمسودة الحالية</p>
          <ul className="mt-1 divide-y divide-border-2">
            {tracked.stale.map(({ c, reason }) => (
              <li key={c.opId} className="flex flex-wrap items-center gap-2 py-2 text-base">
                <span className="min-w-0 flex-1 basis-60"><span className="font-semibold text-text">{c.label}</span> · <span className="text-text-3">{c.why}</span><span className="block text-sm text-bad">{reason}</span></span>
                <button type="button" disabled={decideBusy} onClick={() => void decide(c, "reject")} className="tap inline-flex h-9 items-center rounded-full border border-border-2 px-3.5 text-sm font-semibold text-text-2 transition hover:text-text disabled:opacity-50">شيل التعديل</button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {showVersions ? <VersionsPanel versions={versions} openId={preview?.v.id ?? null} busy={vBusy} error={vError} onOpen={(v) => void openVersion(v)} onRestore={(v) => void restore(v)} onUndoAccept={undoAccept} /> : null}

      {preview ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gold-edge bg-gold-bg px-4 py-2.5 text-base text-text">
          <span className="min-w-0 flex-1 basis-60">نسخة من <bdi dir="ltr" className="font-num">{stamp(preview.v.created_at)}</bdi> (للقراءة بس). لو استرجعتها هتبقى نسخة جديدة.</span>
          <button type="button" disabled={vBusy} onClick={() => void restore(preview.v)} className="tap inline-flex h-9 items-center rounded-full bg-selected px-4 text-sm font-semibold text-on-selected disabled:opacity-50">استرجعها</button>
          <button type="button" onClick={() => setPreview(null)} className="tap inline-flex h-9 items-center rounded-full border border-border-2 px-4 text-sm font-semibold text-text-2">ارجع للحالية</button>
        </div>
      ) : (
        <div role="toolbar" aria-label="تنسيق" className="flex flex-wrap items-center gap-1.5" onMouseDown={(e) => e.preventDefault()}>
          <button type="button" className={cx(tool, sel?.id && current && current.marks?.some((m) => m.k === "b" && m.s <= sel.from && m.e >= sel.to && sel.to > sel.from) && toolOn)} aria-label="غامق" title="غامق (Ctrl+B)" disabled={!canBold} onClick={() => act((h) => h.bold())}><Bold aria-hidden size={16} strokeWidth={2.2} /></button>
          <button type="button" className={cx(tool, current?.t === "h" && toolOn)} aria-label="عنوان" title="عنوان فرعي" aria-pressed={current?.t === "h"} disabled={!canHeading} onClick={() => current && setKind(current.id!, current.t === "h" ? "p" : "h")}><Heading2 aria-hidden size={16} strokeWidth={2} /></button>
          <button type="button" className={cx("tap inline-flex h-10 items-center gap-1.5 rounded-full border border-border-2 px-3.5 text-sm font-semibold text-text-2 transition hover:text-text disabled:opacity-40", sel?.lock && toolOn)} aria-pressed={!!sel?.lock} title="اقتباس: نص حرفي مبيتعدلش" disabled={!canQuote} onClick={() => act((h) => h.quote(!sel?.lock))}>
            {sel?.lock ? <LockOpen aria-hidden size={15} strokeWidth={2} /> : <Lock aria-hidden size={15} strokeWidth={2} />}{sel?.lock ? "فكّ الاقتباس" : "اقتباس"}
          </button>
          <button type="button" className="tap inline-flex h-10 items-center gap-1.5 rounded-full border border-border-2 px-3.5 text-sm font-semibold text-text-2 transition hover:text-text disabled:opacity-40" title="اسأل Clausia عن النص المحدد" disabled={!canAsk} onClick={askAboutSelection}>
            <Sparkles aria-hidden size={15} strokeWidth={2} />اسأل Clausia
          </button>
        </div>
      )}

      <section className="rounded-xl border border-border-2 bg-card shadow-card" aria-label={draft.title}>
        <article className="text-doc px-5 py-6 text-md leading-8 text-text sm:px-12 sm:py-9">
          {style ? <LetterheadTop style={style} /> : null}
          <div className="space-y-3">
            {shown.map((b, i) => {
              const key = b.id ?? i;
              const rep = preview ? undefined : tracked.replaceBy.get(b.id!);
              const adds = preview ? [] : tracked.addAfter.get(b.id!) ?? [];
              const node = (() => {
              if (b.t === "lawyer") {
                const confirm = b.state === "needs_confirmation" && (preview ? true : baseText.get(b.key) === b.text);
                return (
                  <div key={key} className="pt-3">
                    <h2 className="flex flex-wrap items-center gap-2 text-md font-bold text-title">
                      {b.heading}
                      {confirm ? <span className="rounded-full bg-gold-bg px-2.5 py-0.5 font-sans text-xs font-semibold text-gold-text-small">محتاجة تأكيدك</span> : null}
                    </h2>
                    {rep ? (
                      <TrackedText block={b} items={rep} labels={labels} busy={decideBusy} onDecide={decide} className="mt-1.5 rounded-md border border-dashed border-gold-edge px-4 py-2" />
                    ) : editableBlock(b) ? (
                      <Editable block={b} labels={labels} label={b.heading} hint={`${b.hint ?? "بيكتبها المحامي"}: لسه فاضية`} register={register} onFocus={setActive} onChange={(n) => replace(b.id!, n)}
                        className="mt-1.5 rounded-md border border-dashed border-border-strong px-4 py-2 empty:py-4" />
                    ) : (
                      <p className="mt-1.5 whitespace-pre-line">{b.text || <span className="text-text-3">{b.hint ?? "بيكتبها المحامي"}: لسه فاضية</span>}</p>
                    )}
                  </div>
                );
              }
              if (isQuoteBlock(b)) {
                const q = lockMarks(b)[0];
                return (
                  <figure key={key} className="my-2 rounded-sm border-s-4 border-gold-edge bg-card-2 px-4 py-2.5">
                    <blockquote dir={b.dir === "ltr" ? "ltr" : "rtl"} className="whitespace-pre-line">{b.text}</blockquote>
                    <figcaption className="mt-1 flex flex-wrap items-center gap-x-2 font-sans text-xs text-text-3">
                      <Lock aria-hidden size={12} strokeWidth={2} />نص حرفي من {q.src} · مبيتعدلش
                      {editableBlock(b) ? <button type="button" onClick={() => unquote(b.id!)} className="tap text-xs font-semibold text-text-2 underline underline-offset-2 hover:text-text">فكّ الاقتباس</button> : null}
                    </figcaption>
                  </figure>
                );
              }
              const cls = b.t === "title" ? "pb-1 text-center text-lg font-bold text-title" : b.t === "h" ? "pt-3 text-md font-bold text-title" : "";
              if (rep) return <TrackedText key={key} block={b} items={rep} labels={labels} busy={decideBusy} onDecide={decide} className={cls} />;
              return editableBlock(b)
                ? <Editable key={key} block={b} labels={labels} label={b.t === "title" ? "عنوان المذكرة" : b.t === "h" ? "عنوان" : "فقرة"} className={cls} register={register} onFocus={setActive}
                    onChange={(n) => replace(b.id!, n)} onSplit={(cur, at) => split(b.id!, cur, at)} onMergePrev={(cur) => mergePrev(b.id!, normalizeBlock(cur))} />
                : <ReadOnlyBlock key={key} b={b} className={cls} labels={labels} />;
              })();
              return <Fragment key={key}>{node}{adds.map((c) => <AddedBlock key={c.opId} c={c} busy={decideBusy} onDecide={decide} />)}</Fragment>;
            })}
          </div>
          {style ? <LetterheadBottom style={style} /> : null}
        </article>
      </section>

      <details className="rounded-xl border border-border-2 bg-card px-5 py-3 shadow-card sm:px-8">
        <summary className="tap cursor-pointer text-md font-bold text-title">اللي اتملا من الملف ومصدره</summary>
        {draft.fill.filled.length ? (
          <ul className="mt-2 divide-y divide-border-2">
            {draft.fill.filled.map((f) => (
              <li key={f.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-base">
                <span className="w-32 shrink-0 text-text-3">{f.label}</span>
                <bdi className="min-w-0 flex-1 basis-60 whitespace-pre-line font-semibold text-text">{f.value}</bdi>
                <span className="text-sm text-text-3">{f.source}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-base text-text-3">مفيش بيانات اتملت من الملف.</p>}
        {draft.fill.missing.length ? <ul className="mt-2 space-y-0.5 text-sm text-text-3">{draft.fill.missing.map((m) => <li key={m.key}>{m.label}: {m.reason}</li>)}</ul> : null}
      </details>
    </div>
  );
}

/** a block shown but not edited (an old version, or text of an own-template draft that the file fills): the same marks, drawn as text */
function ReadOnlyBlock({ b, className, labels }: { b: DraftBlock; className: string; labels: Map<string, string> }) {
  // the same drawing as the editable box (blockHtml escapes every character of the text)
  return <p dir={b.dir === "ltr" ? "ltr" : "rtl"} className={cx("whitespace-pre-wrap", className)} dangerouslySetInnerHTML={{ __html: blockHtml(b, labels) }} />;
}
