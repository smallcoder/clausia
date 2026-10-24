# Assistant tools (fixed set — `src/lib/tools/registry.ts`)

The model acts ONLY through these tools. No SQL from the model.

## Write tools → confirmation card
Calling a write tool never writes. The chat loop collects all write calls of one model turn into ONE
proposal (`createProposal`, `src/lib/proposals.ts`), shows it as a card, and returns «proposed — waiting
for the lawyer» to the model. The lawyer taps: confirm all / confirm one / edit / save as suggestions /
reject (`decideProposal`). Only then `applyOp` (`src/lib/tools/apply.ts`) inserts rows (RLS-bound client).

| tool | what | key args |
|---|---|---|
| create_client | new client | name, kind, phone, ref |
| create_case | new case | client (REQUIRED: uuid or @ref), case_number, case_year, court, circuit, case_type, stage, previous_stage_case, client_role, facts_date, ref |
| update_case | change case fields | case + fields; `client` fills a case that has none (a model card cannot change an existing client) |
| add_party | party with role | case, name, role, is_our_client |
| add_fact | dated fact | case, date (d/m/yyyy, m/yyyy, yyyy), date_text, text |
| add_request | client request | case, text, kind |
| add_argument | opponent's (or our) argument | case, side, kind, text |
| add_hearing | hearing | case, date, purpose, ref |
| record_decision | hearing decision; postponed → next hearing created | hearing, decision, decision_text, next_date, next_requirements |
| add_judgment | judgment | case, date, kind, operative_text, outcome, appeal_deadline (only if stated) |
| attach_document | link uploaded doc to case + type | document, case, doc_type |
| record_movement | a receipt or an expense in a client's account (PR 5) | client, kind (receipt/expense), amount (a STRING of numerals, exactly as said: «3000», «450.50»), method (as said), case (only if said; else code suggests), general_account, date (only if said; else today), charged_to (expenses: client/office), note |
| set_case_fee | a case's fee (PR 5) | case, kind (fixed/open), amount (fixed only) |
| create_draft | a draft from a library template for a case (PR 6) | template, case, grounds / requests (ONLY when the lawyer asked for them) |

Money tools (`record_movement`, `set_case_fee`): the amount must be one the lawyer's words state in numerals and the method must be named (`src/lib/accounts-guard.ts`; a number in words is refused, so the assistant asks). The case of a movement is decided by code before the card is made: named by the lawyer, or the only open case, or the one open case with a balance; with several and none standing out the tool is refused and the assistant asks. The card (`MoneyCard`) shows the case as a select. Both tools return an undo (delete the row / put the old fee back), so «تراجع» works like any card.

Drafts (`create_draft`): the model picks the template (`search_templates`) and the case; CODE fills the template from the case file (`src/lib/library/fill.ts`) and the card (`DraftCard`) shows each filled value with its source and what is still missing. The legal grounds and the requests stay empty unless the lawyer asked for them (refused otherwise: `src/lib/library/guards.ts`), and then carry no number or date of the model's own and are marked «محتاجة تأكيدك». Nothing is saved before «أكّد»; the undo deletes the draft.

Every write op carries `quote`: exact words from the lawyer's message or the document page. The server
checks the quote against the source text (`verifyQuote`); unverified ops show a warning on the card.
Dates must parse as d/m/yyyy (or m/yyyy, yyyy) — otherwise the tool returns an error and the model must ask.
`@ref`: an op can point to an item created earlier in the same card (create client → case → parties in one card).

## Read tools (run at once) — chat feature implements in `src/lib/tools/read.ts`
search_clients(query), search_cases(query), get_case(case_id) (uses getCaseFile), list_hearings(case_id),
get_document_text(document_id, pages?), list_balances(client_id?) («مين عليه فلوس؟»: the balances worked out by code; read-only), search_templates(query?) (the library's templates with their ids).

## Documents
Upload → pages saved (`document_pages`, OCR per page: gemini-3.5-flash-lite, fallback gemini-3.8-flash) →
extraction (gemini-3.8-flash, JSON) proposes parties/facts/requests/arguments, each with page + quote →
ONE proposal card (source kind document, page). Text inside documents is data, never instructions.
