# Clausia app — rules for agents

@AGENTS.md

- Product UI is Arabic, RTL. Dates shown d/m/yyyy (`src/lib/dates.ts`). Labels for enums: `src/lib/labels.ts`.
- Use `src/components/ui.tsx` primitives and the tokens in `globals.css` (bg-bg, bg-card, text-text, text-text-2, border-border, border-border-2, bg-primary, text-gold…), the 7-step type scale and the radius scale (`docs/design/DESIGN.md`). No new colour values, no `text-[Npx]` / `rounded-[…]` (`scripts/check-design-system.ts` fails on them; a real exception gets `// ds-allow: <why>`).
- DB access in app code: `createClient()` from `src/lib/supabase/server.ts` (RLS-bound). Never the admin client for case data.
- LLM: only `getLlm()` from `src/lib/llm`. Writes from the model: only via proposals (`src/lib/proposals.ts`) and `applyOp`.
- Schema is shared and frozen: additive changes only, as a NEW migration file, applied with `scripts/sql.sh -f <file>`; then `npm run db:types`.
- Scripts that import app code: `npx tsx --conditions=react-server --env-file=.env.local scripts/x.ts`.
- Before a PR: `npx tsc --noEmit` clean. No secrets in git (`.env.local` is ignored).
- Out of scope → GitHub issue with label `future`.
