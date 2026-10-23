-- «ضدنا · دفوع الخصم»: which of OUR arguments answers a defense of the opponent (split layout, sides PR).
-- A defense is «اترد عليه» only when this column points at our argument; null = «محتاج رد». Never inferred from text.
-- Additive only: one nullable column + a check that the link stays inside the defense's own office and case
-- (a foreign key alone would accept another office's id: FKs are not filtered by RLS).
alter table case_arguments add column if not exists reply_argument_id uuid references case_arguments (id) on delete set null;
create index if not exists case_arguments_reply_argument_id_idx on case_arguments (reply_argument_id);

create or replace function case_arguments_check_reply() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.reply_argument_id is not null then
    if new.side <> 'opponent' then
      raise exception 'only a defense of the opponent can have a reply';
    end if;
    -- security invoker: the select goes through RLS, so an argument of another office is simply not found
    if not exists (
      select 1 from case_arguments
      where id = new.reply_argument_id and office_id = new.office_id and case_id = new.case_id and side = 'ours' and id <> new.id
    ) then
      raise exception 'reply not found in this case';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists case_arguments_check_reply on case_arguments;
create trigger case_arguments_check_reply before insert or update of reply_argument_id, case_id, side on case_arguments
  for each row execute function case_arguments_check_reply();
