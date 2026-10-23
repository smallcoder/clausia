-- Chat sessions (PR 4, الموكلين): a client is a chat context, like a case. A session belongs to the general context (no case, no client),
-- to ONE case, or to ONE client. Additive only: a nullable column, an index, a check, and the link trigger now also checks the client.
-- RLS: chat_threads already has the office policies on the whole table; a new column falls under them, so no new policy.
-- (A foreign key alone would accept another office's client id: FKs are not filtered by RLS; the trigger below runs as the caller, so RLS hides it.)
alter table chat_threads add column if not exists client_id uuid references clients (id) on delete cascade;
create index if not exists chat_threads_client_id_idx on chat_threads (client_id);
alter table chat_threads drop constraint if exists chat_threads_one_context;
alter table chat_threads add constraint chat_threads_one_context check (case_id is null or client_id is null);

create or replace function chat_threads_check_links() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  -- security invoker: the selects below go through RLS, so a row of another office is simply not found
  if new.case_id is not null and not exists (select 1 from cases where id = new.case_id and office_id = new.office_id) then
    raise exception 'case not found';
  end if;
  if new.client_id is not null and not exists (select 1 from clients where id = new.client_id and office_id = new.office_id) then
    raise exception 'client not found';
  end if;
  if new.hearing_id is not null and not exists (
    select 1 from hearings where id = new.hearing_id and office_id = new.office_id and case_id is not distinct from new.case_id
  ) then
    raise exception 'hearing not found in this case';
  end if;
  return new;
end $$;

drop trigger if exists chat_threads_check_links on chat_threads;
create trigger chat_threads_check_links before insert or update of case_id, client_id, hearing_id on chat_threads
  for each row execute function chat_threads_check_links();
