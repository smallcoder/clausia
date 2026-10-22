-- The lawyer's own reminders (first use: «ذكّرني الصبح 7» on the brief page /brief).
--   one row = «at remind_at, show this reminder in the bell (and as a browser notification if the tab is open)».
--   for_date = the day the reminder is about (the hearings day); `kind` says what it is ('brief' = the brief of that day).
--   dismissed_at = the lawyer opened it from the bell.  Undo = the lawyer deletes the row.
-- It is the lawyer's own direct action, so no confirmation card and no proposal: nothing here comes from the model.
-- Additive only (a new table). Row-level security: the lawyer's OWN rows of their office only (office + created_by).
-- One reminder per lawyer, kind and day (a second tap on the chip finds the first).

create table reminders (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null default 'brief',
  for_date date not null,
  remind_at timestamptz not null,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (created_by, kind, for_date)
);
create index on reminders (created_by, remind_at);

alter table reminders enable row level security;
create policy own_select on reminders for select to authenticated using (office_id = current_office_id() and created_by = auth.uid());
create policy own_insert on reminders for insert to authenticated with check (office_id = current_office_id() and created_by = auth.uid());
create policy own_update on reminders for update to authenticated using (office_id = current_office_id() and created_by = auth.uid()) with check (office_id = current_office_id() and created_by = auth.uid());
create policy own_delete on reminders for delete to authenticated using (office_id = current_office_id() and created_by = auth.uid());
