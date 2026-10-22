-- Case documents table: a lawyer's own question asked of every paper of a case becomes a COLUMN of that table.
--   doc_columns      = the column: the question, its title, which case. Provenance as the other content tables.
--   doc_column_cells = one cell per paper: the short answer, and where in the paper it is (page, verbatim quote, span).
-- Additive only (new tables). Both are written only by the confirmation card (applyOp), never by the model directly.
-- A cell with answer = null is «مش مذكور» (the paper does not say it, or the model's quote could not be found on
-- the page: then `note` says so). A paper with no cell row was not asked (added after the column): the table shows «—».
-- Same row-level security as every other office table: office_select / insert / update / delete on current_office_id().

create table doc_columns (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  case_id uuid not null references cases (id) on delete cascade,
  question text not null,
  title text not null,
  review_status item_status not null default 'confirmed',
  created_by_kind actor_kind not null default 'lawyer',
  source_kind source_kind not null default 'manual', -- the question is typed on the documents page: 'manual'
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  constraint doc_columns_text_ck check (length(btrim(question)) > 0 and length(btrim(title)) > 0)
);
create index on doc_columns (case_id, created_at);

create table doc_column_cells (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  column_id uuid not null references doc_columns (id) on delete cascade,
  document_id uuid not null references documents (id) on delete cascade,
  answer text,   -- null = «مش مذكور»
  note text,     -- why it is «مش مذكور» when the model said it was there but the page does not show it
  review_status item_status not null default 'confirmed',
  created_by_kind actor_kind not null default 'lawyer',
  source_kind source_kind not null default 'document',
  source_document_id uuid references documents (id) on delete set null,
  source_page int,
  source_quote text,
  source_char_start int,
  source_char_end int,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  unique (column_id, document_id),
  constraint doc_column_cells_source_span_ck check ((source_char_start is null and source_char_end is null) or (source_char_start >= 0 and source_char_end > source_char_start)),
  -- an answer always carries the page and the verbatim quote that prove it
  constraint doc_column_cells_answer_source_ck check (answer is null or (source_page is not null and source_quote is not null))
);
create index on doc_column_cells (column_id);
create index on doc_column_cells (document_id);

do $$
declare t text;
begin
  foreach t in array array['doc_columns', 'doc_column_cells']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy office_select on %I for select to authenticated using (office_id = current_office_id())', t);
    execute format('create policy office_insert on %I for insert to authenticated with check (office_id = current_office_id())', t);
    execute format('create policy office_update on %I for update to authenticated using (office_id = current_office_id()) with check (office_id = current_office_id())', t);
    execute format('create policy office_delete on %I for delete to authenticated using (office_id = current_office_id())', t);
  end loop;
end $$;
