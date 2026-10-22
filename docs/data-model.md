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
| chat_threads | case_id (null = general chat) | every case gets a thread |
| chat_messages | thread_id, role (user/assistant/tool), content, tool_calls jsonb (incl. provider raw parts), attachments | |
| proposals | thread_id, message_id, case_id, document_id, ops jsonb, status | **confirmation cards** — nothing in the content tables is written before the tap |
| llm_calls | purpose, provider, model, tokens, cost_usd, latency_ms, ok, error | spend cap check sums cost_usd |

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
