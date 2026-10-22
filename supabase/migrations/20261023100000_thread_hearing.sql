-- Chat sessions (PR 1 of the chat-first split layout): a session can be linked to one hearing («جلسة 22/10»).
-- Additive only: a nullable column + a check that a thread's case / hearing belong to the thread's own office
-- (a foreign key alone would accept another office's id: FKs are not filtered by RLS).
alter table chat_threads add column if not exists hearing_id uuid references hearings (id) on delete set null;
create index if not exists chat_threads_hearing_id_idx on chat_threads (hearing_id);

create or replace function chat_threads_check_links() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  -- security invoker: the selects below go through RLS, so a row of another office is simply not found
  if new.case_id is not null and not exists (select 1 from cases where id = new.case_id and office_id = new.office_id) then
    raise exception 'case not found';
  end if;
  if new.hearing_id is not null and not exists (
    select 1 from hearings where id = new.hearing_id and office_id = new.office_id and case_id is not distinct from new.case_id
  ) then
    raise exception 'hearing not found in this case';
  end if;
  return new;
end $$;

drop trigger if exists chat_threads_check_links on chat_threads;
create trigger chat_threads_check_links before insert or update of case_id, hearing_id on chat_threads
  for each row execute function chat_threads_check_links();
