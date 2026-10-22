-- «Source to the sentence»: where in the page the quote sits. A row that came from a paper already keeps the
-- document, the page and the quote (source_*); now it keeps the character span too, so the side panel can
-- highlight the exact sentence without ever asking the model to find it again.
--   source_char_start / source_char_end = offsets into document_pages.text (the page's ORIGINAL text, not the
--   normalised one), end exclusive: page_text.slice(start, end) is the quote as the page writes it.
-- Both are null for rows made before this change and for rows with no paper source (the panel then finds the quote
-- with the same code matcher). Additive only: nullable columns, plus a check that a span is a real range.

do $$
declare t text;
begin
  foreach t in array array['clients', 'cases', 'case_parties', 'case_facts', 'case_requests', 'case_arguments', 'hearings', 'judgments'] loop
    execute format('alter table %I add column if not exists source_char_start int, add column if not exists source_char_end int', t);
    execute format('alter table %I drop constraint if exists %I', t, t || '_source_span_ck');
    execute format('alter table %I add constraint %I check ((source_char_start is null and source_char_end is null) or (source_char_start >= 0 and source_char_end > source_char_start))', t, t || '_source_span_ck');
  end loop;
end $$;

-- a hearing decision is an item of its own (see decision_provenance): its span is kept apart from the hearing row's
alter table hearings
  add column if not exists decision_source_char_start int,
  add column if not exists decision_source_char_end int;
alter table hearings drop constraint if exists hearings_decision_source_span_ck;
alter table hearings add constraint hearings_decision_source_span_ck
  check ((decision_source_char_start is null and decision_source_char_end is null) or (decision_source_char_start >= 0 and decision_source_char_end > decision_source_char_start));

-- record_hearing_decision takes the span too (two new arguments with defaults: a caller that does not pass them
-- still works). The old 11-argument version is dropped so the name stays unambiguous.
drop function if exists record_hearing_decision(uuid, hearing_decision, text, date, text, source_kind, actor_kind, uuid, uuid, int, text);

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
  p_source_quote text default null,
  p_source_char_start int default null,
  p_source_char_end int default null
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
        created_by_kind, source_kind, source_message_id, source_document_id, source_page, source_quote, source_char_start, source_char_end)
      values (h.office_id, h.case_id, p_next_date, p_next_requirements, h.id,
        p_created_by_kind, p_source_kind, p_source_message_id, p_source_document_id, p_source_page, p_source_quote, p_source_char_start, p_source_char_end)
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
    decision_source_quote = p_source_quote,
    decision_source_char_start = p_source_char_start,
    decision_source_char_end = p_source_char_end
  where id = h.id;

  if p_decision = 'reserved_for_judgment' then
    update cases set status = 'reserved_for_judgment', updated_at = now() where id = h.case_id;
  elsif p_decision = 'judgment' then
    update cases set status = 'judged', updated_at = now() where id = h.case_id;
  end if;

  return jsonb_build_object('hearing_id', h.id, 'next_hearing_id', nxt);
end $$;

grant execute on function record_hearing_decision to authenticated;
