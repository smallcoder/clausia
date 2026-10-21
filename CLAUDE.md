# Clausia app — rules for agents

@AGENTS.md

- Product UI is Arabic, RTL. Dates shown d/m/yyyy (`src/lib/dates.ts`). Labels for enums: `src/lib/labels.ts`.
- Use `src/components/ui.tsx` primitives and the tokens in `globals.css` (bg-bg, bg-card, text-text, text-text-2, border-border, border-border-2, bg-primary, text-gold…), the 7-step type scale and the radius scale (`docs/design/DESIGN.md`). No new colour values, no `text-[Npx]` / `rounded-[…]`, and no arbitrary width, height, padding, margin, gap, inset, translate or basis (`w-[440px]`, `sm:h-[46px]`): a value used twice becomes a token in `globals.css` (`max-w-page`, `size-control`), a one-off on the scale uses the scale class (`w-110`) (`scripts/check-design-system.ts` fails on them; `--self-test` proves the rules; a real exception gets `// ds-allow: <why>`).
- DB access in app code: `createClient()` from `src/lib/supabase/server.ts` (RLS-bound). Never the admin client for case data.
- LLM: only `getLlm()` from `src/lib/llm`. Writes from the model: only via proposals (`src/lib/proposals.ts`) and `applyOp`.
- Schema is shared and frozen: additive changes only, as a NEW migration file, applied with `scripts/sql.sh -f <file>`; then `npm run db:types`.
- Scripts that import app code: `npx tsx --conditions=react-server --env-file=.env.local scripts/x.ts`.
- Before a PR: `npx tsc --noEmit` clean. No secrets in git (`.env.local` is ignored).
- Out of scope → GitHub issue with label `future`.

## Models for agents (owner decision 2026-10-21)

Building (pass `model` on every Agent / workflow call):
- **Sonnet 5.5**: the default.
- **Haiku 5.5**: small mechanical tasks: screenshots and re-shoots, renames, running tests, simple copy changes.
- **Opus 5.5**: only when the task really needs it (tricky logic, architecture, a hard bug). Say why in the PR.

Reviews before merge:
- **Sonnet 5.5**: UI PRs (layout, styles, components, screenshots).
- **Fable 5.1**: only PRs that touch security or data: RLS, auth, the never-guess guard, writes (proposals, `applyOp`, server actions that write), and anything that reads LawMill. A PR with both gets Fable.
