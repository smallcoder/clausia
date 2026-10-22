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
