# Clausia v1 — data model

Goal: structured case data that an opinion/memo LLM can read later (with LawMill). Work back from what
an opinion needs: who is who, what happened when (and which law version applies — `cases.facts_date`),
what our client asks, what the opponent argues, what the court decided.

Schema: `supabase/migrations/20261020150000_base_schema.sql`. Types: `src/lib/db/types.ts` (`npm run db:types`).

## Tenancy and security
- Every row has `office_id` (default `current_office_id()`). RLS on every table: same 4 policies
  (`office_id = current_office_id()`). One office per user, made by the sign-up trigger. No roles in v1.
- Browser uses the publishable key only. The secret key is server-only (`src/lib/supabase/admin.ts`),
  used for scripts/tests and the LLM cost log — never for case data in app code.
- Storage bucket `documents` (private). Path `{office_id}/{document_id}/{file_name}`; policies check the first folder.

## Provenance (on every content table)
| column | values | meaning |
|---|---|---|
| `review_status` | suggested / confirmed / rejected | confirmed = lawyer tapped confirm; suggested = lawyer chose «save as suggestions» (shown flagged until confirmed) |
| `created_by_kind` | lawyer / model | model = drafted by the assistant; lawyer = typed or edited by the lawyer |
| `source_kind` | chat / document / manual | where it came from |
| `source_message_id` | chat_messages.id | chat source |
| `source_document_id`, `source_page` | documents.id, page no | document source |
| `source_quote` | text | exact words that support the item (checked against the source) |
| `source_char_start`, `source_char_end` | int, int | where the quote sits in the page's ORIGINAL text (`document_pages.text.slice(start, end)`, end exclusive); worked out by code when the quote was verified, never by the model. Null for older rows and for chat / manual sources: the paper panel then finds the quote with the same code matcher. A hearing's decision keeps its own (`decision_source_char_*`) |
| `created_by` | auth user | who saved it |

## Tables
| table | key fields | notes |
|---|---|---|
| offices / office_members | name; user_id → office_id | 1 office per user |
| clients | name, kind (person/company), phone, address, notes | |
| cases | client_id, title, case_number (text), case_year, court, circuit, case_type, stage (first_instance/appeal/cassation), previous_stage_case_id, status (active/reserved_for_judgment/judged/suspended/closed), client_role, **facts_date + facts_date_precision**, summary | facts_date = main «تاريخ الوقائع»: LawMill picks the law version by it |
| case_parties | name, role (plaintiff, defendant, appellant, appellee, cassation_*, intervener, guarantor, witness, expert, other), is_our_client, client_id, representative | |
| case_facts | fact_date + date_precision (day/month/year/unknown), date_text (as stated), text | ordered by date |
| case_requests | text, kind (primary/alternative/precautionary) | our client's requests |
| case_arguments | side (opponent/ours), kind (formal/substantive defense…), text | |
| hearings | hearing_date, purpose, decision_type (postponed / reserved_for_judgment / judgment / struck_off / referred_to_expert / suspended / other), decision_text, next_requirements, previous_hearing_id, next_hearing_id, decided_at | decision_type null = no decision yet |
| judgments | judgment_date, kind (final/preliminary/interim), operative_text, outcome, **appeal_deadline (only as the lawyer states it)**, hearing_id | never auto-calculated |
| documents | case_id, client_id, thread_id, storage_path, file_name, mime_type, doc_type (claim_sheet, contract, opponent_memo, our_memo, judgment, power_of_attorney, expert_report, evidence, correspondence, id_document, other), page_count, read_status | |
| document_pages | document_id, page_no, text, model | extracted text per page |
| chat_threads | case_id or client_id (both null = general chat; never both) | every case gets a thread; a client has its own sessions |
| chat_messages | thread_id, role (user/assistant/tool), content, tool_calls jsonb (incl. provider raw parts), attachments | |
| case_fees | case_id (unique), kind (fixed/open), amount_piasters (bigint; null when open) | PR 5. The fee agreed for one case; optional: no row = not set. «open» = no amount, so no balance |
| account_movements | client_id, case_id (null = the client's general account), kind (receipt/expense), amount_piasters (bigint, > 0), method (cash/vodafone_cash/instapay/bank_transfer/cheque), moved_on, charged_to (client/office, expenses only), note | PR 5. **Money is integer piasters, never a float.** A link trigger checks that the client and the case are visible and that the case is the client's. Deleting a client or case that has movements is refused (restrict) |
| templates | office_id (**null = a base template shared by all offices**), slug, name, category (claim/appeal/memo/notice/contract), description, body jsonb {blocks[], manual[], for_stage}, storage_path (an uploaded .docx), needs_lawyer_review | PR 6. Base rows are readable by every office and writable by no one through the app (the insert/update/delete policies need `office_id = current_office_id()`). Our own plain structure: nothing copied from a book, a database or a web page. Use counts are counted from `drafts`, not stored |
| drafts | case_id, template_id (set null), template_name, title, body jsonb (resolved blocks), fill jsonb {filled[{key,label,value,source}], missing[], lawyer[{key,heading,state}]}, needs_lawyer_review, review_status, provenance | PR 6. A draft from a template for one case. A link trigger checks the case and the template are visible. Deleting a case that has drafts is refused (restrict) |
| office_style | office_id (unique), file_name, storage_path, style jsonb {header, footer, fonts, margins, page} | PR 6b. The office's paper, read from a Word file the lawyer uploaded (the file is in the «documents» bucket under `{office_id}/office-style/…`) |
| proposals | thread_id, message_id, case_id, document_id, ops jsonb, status | **confirmation cards** — nothing in the content tables is written before the tap |
| llm_calls | purpose, provider, model, tokens, cost_usd, latency_ms, ok, error | spend cap check sums cost_usd |

## Money (PR 5, الحسابات)
- Amounts are whole piasters (1 EGP = 100) in `bigint` columns, whole JS integers in code (`src/lib/money.ts`: `parseAmount` reads Western and Arabic numerals and refuses anything unclear, `formatAmount` groups with commas). No float anywhere.
- Paid so far = confirmed receipts. Remaining = fixed fees − paid on those cases (never below zero; an overpayment is shown apart). Open or unset fees have no balance. Expenses charged to the client are summed apart; ones charged to the office are listed, not billed. A row saved «as a suggestion» is shown tagged and counted nowhere (`src/lib/accounts-calc.ts`).
- Migration `20261025100000_accounts.sql` (+ `_down.sql`, never run by a tool). RLS: the standard four office policies. Tests: `scripts/test-accounts-rls.sql` (one transaction, rolled back), `scripts/test-accounts.ts`.

## The library (PR 6, المكتبة)
- A template body is a list of blocks (`src/lib/library/types.ts`): `title`, `h`, `p` (text with `{{placeholders}}`) and `lawyer` (a section that is ALWAYS empty: the legal grounds, the requests).
- **Code fills, the model only picks** (`src/lib/library/fill.ts`): `create_draft` takes a template id and a case id; the values come from the CONFIRMED items of the case file, each with its source («حكم · ص 3», «بيانات الدعوى · المحكمة»); a value the file does not have stays empty and is listed; two judgments are not picked between; a template for the next stage (`for_stage`) never takes the first-instance court as the appeal's court.
- The grounds and the requests are drafted only when the lawyer asked in his own words, carry no number or date the lawyer's words and the case file do not have (`src/lib/library/guards.ts`), and are marked «محتاجة تأكيدك».
- Migrations `20261026100000_library.sql` (+ `_down.sql`, never run by a tool) and `20261026100100_library_template_stage.sql`. RLS: `drafts` and `office_style` the standard four policies; `templates` reads base + own. Tests: `scripts/test-library-rls.sql` (one transaction, rolled back; it covers the existing storage policies on the new Word paths), `scripts/test-library.ts`.

## Rules in the database
- `record_hearing_decision(hearing_id, decision, text, next_date, next_requirements, provenance…)`:
  one place for «postponed to X creates the next hearing» (links previous/next), sets the case status
  for reserved/judgment. A postponement without a next date is refused.

## getCaseFile(caseId)
`src/lib/case-file.ts` — the whole case as one JSON (`CaseFile` type, `schema_version: 1`). Confirmed items in
their sections; `suggested` items listed in `pending_suggestions`. This is what the opinion LLM reads.

## Appeal deadlines (item 5, behind `NEXT_PUBLIC_FEATURE_DEADLINES`)
Migrations `20261022170000_deadlines.sql` and `20261022170100_holiday_reports_withdraw.sql` (additive).
- `case_deadlines` (office table, standard office RLS): one row per saved deadline of a judgment (`kind` appeal | cassation, `unique (judgment_id, kind)`).
  `days` is read by code from the article text, `raw_last_day = start_date + days` (art. 15), `last_day` after moving off a Friday / an approved holiday (art. 18).
  The row keeps the article's `version_id`, `article_sha256` and the verbatim `article_text` it was computed from, `urgent`, `start_basis`
  (`judgment_date` | `service_date`, art. 213), `holidays_reviewed` (false = the card said «راجع الإجازات»), and `reminders int[]` (days before the last day).
  Written only by `applyOp('add_deadline')` (code-made, internal tool) after the lawyer's tap.
- `holidays` (SHARED): everyone reads; insert / update / delete only `is_admin()`. Only `approved` rows are used in a computation.
- `holiday_reports` (office): an office inserts (pending only) and reads its own and may withdraw a pending one; an admin reads all and decides.
- `app_admins` (SHARED): no policy and no grant: not readable or writable from the app. `is_admin()` (security definer) reads it.
