"use client";
// PREVIEW HOST for scripts/draft-editor-shots.ts (development only: the page 404s in production). The real DraftEditor with stand-in actions, so the
// screenshots need no database write: a save, a restore and a ✓ / × only record that they were asked for (window.__saves / window.__decided).
import { useRef } from "react";
import { DraftEditor, type EditorActions } from "@/components/draft/DraftEditor";
import type { PendingChange } from "@/lib/draft/pending";
import type { VersionRow } from "@/lib/draft/store";
import type { DraftBody } from "@/lib/library/types";
import type { DraftFull } from "@/lib/library/list";
import type { OfficeStyle } from "@/lib/word/office-style";

declare global { interface Window { __saves?: number; __decided?: string[] } }

export function Host({ draft, caseId, style, versions, old, changes }: { draft: DraftFull; caseId: string; style: OfficeStyle | null; versions: VersionRow[]; old: DraftBody; changes: PendingChange[] }) {
  const saves = useRef(0);
  const actions: EditorActions = {
    save: async () => { saves.current++; window.__saves = saves.current; return { ok: true, updatedAt: `2026-10-27T10:00:0${saves.current}.000000+00:00` }; },
    restore: async () => ({ ok: true }),
    loadVersion: async () => ({ ok: true, body: old }),
    decide: async (id, mode, opIds) => { (window.__decided ??= []).push(`${mode}:${id}:${opIds.join(",")}`); return { ok: true }; },
  };
  return <DraftEditor draft={draft} caseId={caseId} clientName="كريم المثالي" style={style} versions={versions} changes={changes} actions={actions} />;
}
