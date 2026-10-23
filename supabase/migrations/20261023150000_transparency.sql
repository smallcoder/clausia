-- Transparency (split layout, PR 4): live steps while Clausia works, and «استخدمت:» under each answer.
--   chat_turn_steps: one row per REAL step of a running chat turn (a read tool call, a card being prepared). The browser makes
--     the turn id and polls GET /api/chat/steps for the rows after the last seq it saw. The turn deletes its own rows when it
--     ends, so the table only ever holds turns that are running now.
--   chat_messages.sources: the papers a turn really used, stored with the answer so the footer survives a reload:
--     [{document_id, pages: [int], open: {page, quote, start, end}}]. Null = no source was used, no footer.
-- Additive only. Row-level security: the lawyer's office (current_office_id()).

create table chat_turn_steps (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  turn_id uuid not null,
  seq int not null,
  label text not null,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  unique (turn_id, seq)
);
create index on chat_turn_steps (created_at);

alter table chat_turn_steps enable row level security;
create policy office_select on chat_turn_steps for select to authenticated using (office_id = current_office_id());
create policy office_insert on chat_turn_steps for insert to authenticated with check (office_id = current_office_id() and created_by = auth.uid());
create policy office_delete on chat_turn_steps for delete to authenticated using (office_id = current_office_id());

alter table chat_messages add column if not exists sources jsonb;
