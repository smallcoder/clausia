-- Home's morning brief and the «Clausia noticed» cards (the chat-first split layout, PR 3).
--
-- daily_briefs: the morning brief, built once per lawyer per Cairo day by CODE (src/lib/morning) and cached here, so the
--   first Home load of the day builds and saves it and every later load reads it. `payload` is plain JSON: the sentences, each
--   fact with its source, and the counts for the line under it. Unique per (user, day). The lawyer's own rows only.
-- dismissed_notices: «تجاهل» on a noticed card, per lawyer. One row = «this lawyer does not want to see that card again».
--   `kind` = the kind of card ('hearing_decision' | 'date_conflict'); `key` = what it is about (a hearing id, or the two fact ids
--   of a date conflict, sorted and joined with ':'). Insert and read only: a dismissed card never comes back.
-- Nothing here comes from the model, and nothing here changes a case: both tables are the lawyer's own view state.
-- Additive only (two new tables). Row-level security: the lawyer's OWN rows of their office only (office + user).

create table daily_briefs (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  for_date date not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, for_date)
);

alter table daily_briefs enable row level security;
create policy own_select on daily_briefs for select to authenticated using (office_id = current_office_id() and user_id = auth.uid());
create policy own_insert on daily_briefs for insert to authenticated with check (office_id = current_office_id() and user_id = auth.uid());
create policy own_delete on daily_briefs for delete to authenticated using (office_id = current_office_id() and user_id = auth.uid());

create table dismissed_notices (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,
  key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind, key)
);

alter table dismissed_notices enable row level security;
create policy own_select on dismissed_notices for select to authenticated using (office_id = current_office_id() and user_id = auth.uid());
create policy own_insert on dismissed_notices for insert to authenticated with check (office_id = current_office_id() and user_id = auth.uid());
