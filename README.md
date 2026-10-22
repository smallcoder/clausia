# Clausia

The case file for Egyptian lawyers, filled through chat. Next.js + Supabase + Gemini.

```bash
npm install
cp .env.example .env.local   # fill in
npm run dev
```

Docs: docs/data-model.md, docs/tools.md, docs/screens.md

## Feature flags

A flag is an env var, default OFF (only `1` turns it on), read on the server in `src/lib/flags.ts`.

| Flag | What it shows | Before turning it on |
|---|---|---|
| `NEXT_PUBLIC_FEATURE_DOCS_TABLE=1` | The case documents table and «+ عمود جديد» (`?tab=documents`, PR #60) | Ready to turn on once PR `feat/doc-columns-edit` is merged (issues #61 and #65: a saved custom column can be renamed, its cells edited or confirmed, and it can be removed with a confirm step; the answer check is tighter). Off, the documents view is the paper grid with the per-paper panels. |
| `NEXT_PUBLIC_FEATURE_DEADLINES=1` | Appeal / cassation deadlines (item 5): after a judgment is saved, a «مواعيد الطعن» card computed by code from the article text in LawMill; «حطهم في الرول» saves it; the last day and the reminders show on the Roll; `/settings/holidays` | **A lawyer must check the rules first** (the periods read from art. 227 / 252, the start from art. 213, the art. 18 move to the next working day, Friday as the weekly rest, the holiday list, and that art. 18's text is not in LawMill yet). The seeded 2026–2027 holidays are all drafts: the owner approves them at `/settings/holidays`. Needs `LAWMILL_SUPABASE_URL` and `LAWMILL_SUPABASE_PUBLISHABLE_KEY` (server only). Off: nothing new shows and no card is proposed. |
