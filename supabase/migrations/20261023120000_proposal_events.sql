-- «تراجع» after a confirm (split layout, PR 2b): the log of what a confirm saved and how to put it back.
--   action 'confirm' = the lawyer confirmed N ops of a card; undo_data = what is needed to revert exactly that
--     ({steps: delete / restore steps with the row snapshots, ops: the ops as they were, proposal: the card as it was}).
--   action 'undo'    = the lawyer tapped «تراجع» within 10 seconds; undoes_event_id points at the confirm it reverted.
-- An undo is allowed once: the unique index on undoes_event_id refuses a second one (also when two taps race).
-- Append-only log: select and insert for the office, no update, no delete.
-- Additive only (a new table). Row-level security: the lawyer's office (current_office_id()).

create table proposal_events (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  proposal_id uuid not null references proposals (id) on delete cascade,
  op_ids text[] not null,
  action text not null check (action in ('confirm', 'undo')),
  undo_data jsonb,
  undoes_event_id uuid references proposal_events (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  check ((action = 'undo') = (undoes_event_id is not null))
);
create unique index proposal_events_one_undo on proposal_events (undoes_event_id) where undoes_event_id is not null;
create index on proposal_events (proposal_id, created_at);

alter table proposal_events enable row level security;
create policy office_select on proposal_events for select to authenticated using (office_id = current_office_id());
create policy office_insert on proposal_events for insert to authenticated with check (office_id = current_office_id() and created_by = auth.uid());
