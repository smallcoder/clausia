# Clausia app — rules for agents

@AGENTS.md

- Product UI is Arabic, RTL. Dates shown d/m/yyyy (`src/lib/dates.ts`). Labels for enums: `src/lib/labels.ts`.
- Use `src/components/ui.tsx` primitives and the tokens in `globals.css` (bg-paper, bg-surface, text-ink, text-ink-2, border-line, bg-accent, text-suggest…). No new colour values.
- DB access in app code: `createClient()` from `src/lib/supabase/server.ts` (RLS-bound). Never the admin client for case data.
- LLM: only `getLlm()` from `src/lib/llm`. Writes from the model: only via proposals (`src/lib/proposals.ts`) and `applyOp`.
- Schema is shared and frozen: additive changes only, as a NEW migration file, applied with `scripts/sql.sh -f <file>`; then `npm run db:types`.
- Scripts that import app code: `npx tsx --conditions=react-server --env-file=.env.local scripts/x.ts`.
- Before a PR: `npx tsc --noEmit` clean. No secrets in git (`.env.local` is ignored).
- Out of scope → GitHub issue with label `future`.
