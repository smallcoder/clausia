-- A hearing decision is an item of its own: keep where it came from (chat message / document page / manual),
-- who drafted it and the supporting quote — separate from the provenance of the hearing row itself.
alter table hearings
  add column if not exists decision_created_by_kind actor_kind,
  add column if not exists decision_source_kind source_kind,
  add column if not exists decision_source_message_id uuid references chat_messages (id) on delete set null,
  add column if not exists decision_source_document_id uuid references documents (id) on delete set null,
  add column if not exists decision_source_page int,
  add column if not exists decision_source_quote text;

create or replace function record_hearing_decision(
  p_hearing_id uuid,
  p_decision hearing_decision,
  p_decision_text text default null,
  p_next_date date default null,
  p_next_requirements text default null,
  p_source_kind source_kind default 'manual',
  p_created_by_kind actor_kind default 'lawyer',
  p_source_message_id uuid default null,
  p_source_document_id uuid default null,
  p_source_page int default null,
  p_source_quote text default null
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare h hearings; nxt uuid;
begin
  select * into h from hearings where id = p_hearing_id; -- RLS applies (security invoker)
  if not found then raise exception 'hearing not found'; end if;
  if p_decision = 'postponed' and p_next_date is null then
    raise exception 'a postponed decision needs the next hearing date';
  end if;
  if p_next_date is not null and p_next_date <= h.hearing_date then
    raise exception 'next hearing date must be after the hearing date';
  end if;

  if p_next_date is not null then
    if h.next_hearing_id is not null then
      update hearings set hearing_date = p_next_date, purpose = coalesce(p_next_requirements, purpose)
        where id = h.next_hearing_id;
      nxt := h.next_hearing_id;
    else
      insert into hearings (office_id, case_id, hearing_date, purpose, previous_hearing_id,
        created_by_kind, source_kind, source_message_id, source_document_id, source_page, source_quote)
      values (h.office_id, h.case_id, p_next_date, p_next_requirements, h.id,
        p_created_by_kind, p_source_kind, p_source_message_id, p_source_document_id, p_source_page, p_source_quote)
      returning id into nxt;
    end if;
  end if;

  update hearings set
    decision_type = p_decision,
    decision_text = p_decision_text,
    next_requirements = p_next_requirements,
    next_hearing_id = coalesce(nxt, next_hearing_id),
    decided_at = now(),
    decision_created_by_kind = p_created_by_kind,
    decision_source_kind = p_source_kind,
    decision_source_message_id = p_source_message_id,
    decision_source_document_id = p_source_document_id,
    decision_source_page = p_source_page,
    decision_source_quote = p_source_quote
  where id = h.id;

  if p_decision = 'reserved_for_judgment' then
    update cases set status = 'reserved_for_judgment', updated_at = now() where id = h.case_id;
  elsif p_decision = 'judgment' then
    update cases set status = 'judged', updated_at = now() where id = h.case_id;
  end if;

  return jsonb_build_object('hearing_id', h.id, 'next_hearing_id', nxt);
end $$;
