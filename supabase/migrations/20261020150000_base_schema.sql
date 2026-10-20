-- Clausia v1 base schema. Every row carries office_id; RLS limits each user to their own office.
-- Content tables share the provenance columns: status, created_by_kind, source_kind,
-- source_message_id, source_document_id, source_page, source_quote, created_by.

create extension if not exists pg_trgm;

-- ---------- enums ----------
create type item_status as enum ('suggested', 'confirmed', 'rejected');
create type actor_kind as enum ('lawyer', 'model');
create type source_kind as enum ('chat', 'document', 'manual');
create type date_precision as enum ('day', 'month', 'year', 'unknown');
create type case_stage as enum ('first_instance', 'appeal', 'cassation');
create type case_status as enum ('active', 'reserved_for_judgment', 'judged', 'suspended', 'closed');
create type party_role as enum (
  'plaintiff', 'defendant', 'appellant', 'appellee', 'cassation_appellant', 'cassation_appellee',
  'intervener', 'guarantor', 'witness', 'expert', 'other');
create type hearing_decision as enum (
  'postponed', 'reserved_for_judgment', 'judgment', 'struck_off', 'referred_to_expert',
  'suspended', 'other');
create type judgment_kind as enum ('final', 'preliminary', 'interim');
create type doc_type as enum (
  'claim_sheet', 'contract', 'opponent_memo', 'our_memo', 'judgment', 'power_of_attorney',
  'expert_report', 'evidence', 'correspondence', 'id_document', 'other');
create type read_status as enum ('pending', 'reading', 'done', 'failed');
create type argument_side as enum ('opponent', 'ours');
create type client_kind as enum ('person', 'company');
create type chat_role as enum ('user', 'assistant', 'tool');
create type proposal_status as enum ('pending', 'confirmed', 'partially_confirmed', 'rejected');

-- ---------- offices ----------
create table offices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table office_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  office_id uuid not null references offices (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
create index on office_members (office_id);

-- The one RLS helper: the caller's office (one office per user in v1).
create or replace function current_office_id() returns uuid
language sql stable security definer set search_path = public as $$
  select office_id from office_members where user_id = auth.uid()
$$;
revoke all on function current_office_id() from public;
grant execute on function current_office_id() to authenticated;

-- Sign-up creates the user's office.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare new_office uuid;
begin
  insert into offices (name)
  values (coalesce(nullif(new.raw_user_meta_data ->> 'office_name', ''), 'مكتب ' || split_part(new.email, '@', 1)))
  returning id into new_office;
  insert into office_members (user_id, office_id, display_name)
  values (new.id, new_office, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- chat (before content tables: they reference messages) ----------
create table chat_threads (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  case_id uuid, -- null = general chat (new clients / cases); FK added below
  title text,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  thread_id uuid not null references chat_threads (id) on delete cascade,
  role chat_role not null,
  content text not null default '',
  -- provider-neutral record of tool calls / results / raw provider parts needed to replay the turn
  tool_calls jsonb,
  attachments jsonb, -- [{document_id, file_name}]
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
create index on chat_messages (thread_id, created_at);

-- ---------- core ----------
create table clients (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  name text not null,
  kind client_kind not null default 'person',
  phone text,
  address text,
  notes text,
  review_status item_status not null default 'confirmed',
  created_by_kind actor_kind not null default 'lawyer',
  source_kind source_kind not null default 'manual',
  source_message_id uuid references chat_messages (id) on delete set null,
  source_document_id uuid,
  source_page int,
  source_quote text,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table cases (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  client_id uuid references clients (id) on delete set null,
  title text, -- short label, e.g. «دعوى صحة توقيع — فلان ضد فلان»
  case_number text, -- as written (may contain letters), e.g. «1234»
  case_year int,
  court text, -- e.g. «محكمة شمال القاهرة الابتدائية»
  circuit text, -- الدائرة, e.g. «الدائرة 12 مدني»
  case_type text, -- مدني / عمال / إيجارات / أسرة / تجاري / جنح / إداري ...
  stage case_stage not null default 'first_instance',
  previous_stage_case_id uuid references cases (id) on delete set null,
  status case_status not null default 'active',
  client_role party_role,
  facts_date date, -- the case's main «تاريخ الوقائع»: LawMill picks the law version by it
  facts_date_precision date_precision not null default 'unknown',
  summary text,
  review_status item_status not null default 'confirmed',
  created_by_kind actor_kind not null default 'lawyer',
  source_kind source_kind not null default 'manual',
  source_message_id uuid references chat_messages (id) on delete set null,
  source_document_id uuid,
  source_page int,
  source_quote text,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on cases (office_id, case_year, case_number);
create index cases_search_idx on cases using gin ((coalesce(title,'') || ' ' || coalesce(case_number,'') || ' ' || coalesce(court,'')) gin_trgm_ops);

alter table chat_threads add constraint chat_threads_case_fk foreign key (case_id) references cases (id) on delete cascade;
create index on chat_threads (office_id, case_id);

create table documents (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  case_id uuid references cases (id) on delete set null,
  client_id uuid references clients (id) on delete set null,
  thread_id uuid references chat_threads (id) on delete set null, -- where it was uploaded
  storage_path text not null, -- bucket «documents», path {office_id}/{document_id}/{file_name}
  file_name text not null,
  mime_type text not null,
  size_bytes bigint,
  doc_type doc_type not null default 'other',
  title text,
  doc_date date,
  page_count int,
  read_status read_status not null default 'pending',
  read_error text,
  review_status item_status not null default 'confirmed',
  created_by_kind actor_kind not null default 'lawyer',
  source_kind source_kind not null default 'manual',
  source_message_id uuid references chat_messages (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
create index on documents (office_id, case_id);

create table document_pages (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  document_id uuid not null references documents (id) on delete cascade,
  page_no int not null,
  text text not null default '',
  model text,
  created_at timestamptz not null default now(),
  unique (document_id, page_no)
);

-- source_document_id FKs (documents is created after clients / cases)
alter table clients add constraint clients_src_doc_fk foreign key (source_document_id) references documents (id) on delete set null;
alter table cases add constraint cases_src_doc_fk foreign key (source_document_id) references documents (id) on delete set null;

-- Shared provenance columns for the case-content tables.
-- (written out per table for clarity of generated types)
create table case_parties (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  case_id uuid not null references cases (id) on delete cascade,
  name text not null,
  role party_role not null,
  is_our_client boolean not null default false,
  client_id uuid references clients (id) on delete set null,
  representative text, -- the party's lawyer, if known
  notes text,
  review_status item_status not null default 'confirmed',
  created_by_kind actor_kind not null default 'lawyer',
  source_kind source_kind not null default 'manual',
  source_message_id uuid references chat_messages (id) on delete set null,
  source_document_id uuid references documents (id) on delete set null,
  source_page int,
  source_quote text,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
create index on case_parties (case_id);

create table case_facts (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  case_id uuid not null references cases (id) on delete cascade,
  fact_date date, -- null when unknown; when precision is month/year the day/month are 1
  date_precision date_precision not null default 'unknown',
  date_text text, -- the date as stated, e.g. «أوائل 2021»
  text text not null,
  sort_order int,
  review_status item_status not null default 'confirmed',
  created_by_kind actor_kind not null default 'lawyer',
  source_kind source_kind not null default 'manual',
  source_message_id uuid references chat_messages (id) on delete set null,
  source_document_id uuid references documents (id) on delete set null,
  source_page int,
  source_quote text,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
create index on case_facts (case_id, fact_date);

create table case_requests (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  case_id uuid not null references cases (id) on delete cascade,
  text text not null, -- our client's request (طلب أصلي / احتياطي)
  kind text, -- 'primary' | 'alternative' | 'precautionary' | free text
  review_status item_status not null default 'confirmed',
  created_by_kind actor_kind not null default 'lawyer',
  source_kind source_kind not null default 'manual',
  source_message_id uuid references chat_messages (id) on delete set null,
  source_document_id uuid references documents (id) on delete set null,
  source_page int,
  source_quote text,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
create index on case_requests (case_id);

create table case_arguments (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  case_id uuid not null references cases (id) on delete cascade,
  side argument_side not null default 'opponent',
  kind text, -- 'formal_defense' (دفع شكلي) | 'substantive_defense' (دفع موضوعي) | 'argument' | free text
  text text not null,
  review_status item_status not null default 'confirmed',
  created_by_kind actor_kind not null default 'lawyer',
  source_kind source_kind not null default 'manual',
  source_message_id uuid references chat_messages (id) on delete set null,
  source_document_id uuid references documents (id) on delete set null,
  source_page int,
  source_quote text,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
create index on case_arguments (case_id);

create table hearings (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  case_id uuid not null references cases (id) on delete cascade,
  hearing_date date not null,
  purpose text, -- what the hearing is for, if stated
  decision_type hearing_decision, -- null = no decision recorded yet
  decision_text text,
  next_requirements text, -- what is needed next time (المطلوب للجلسة القادمة)
  previous_hearing_id uuid references hearings (id) on delete set null,
  next_hearing_id uuid references hearings (id) on delete set null,
  decided_at timestamptz,
  review_status item_status not null default 'confirmed',
  created_by_kind actor_kind not null default 'lawyer',
  source_kind source_kind not null default 'manual',
  source_message_id uuid references chat_messages (id) on delete set null,
  source_document_id uuid references documents (id) on delete set null,
  source_page int,
  source_quote text,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
create index on hearings (office_id, hearing_date);
create index on hearings (case_id, hearing_date);

create table judgments (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  case_id uuid not null references cases (id) on delete cascade,
  hearing_id uuid references hearings (id) on delete set null,
  judgment_date date,
  kind judgment_kind not null default 'final',
  operative_text text not null, -- منطوق الحكم / القرار
  outcome text, -- 'for_us' | 'against_us' | 'partial' | free text, only as the lawyer states it
  appeal_deadline date, -- ONLY as the lawyer states it; never calculated
  appeal_deadline_note text,
  review_status item_status not null default 'confirmed',
  created_by_kind actor_kind not null default 'lawyer',
  source_kind source_kind not null default 'manual',
  source_message_id uuid references chat_messages (id) on delete set null,
  source_document_id uuid references documents (id) on delete set null,
  source_page int,
  source_quote text,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
create index on judgments (case_id);

-- A confirmation card: a list of ops the model proposed. Nothing in the content tables is
-- written until the lawyer confirms (whole card or op by op).
create table proposals (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  thread_id uuid references chat_threads (id) on delete cascade,
  message_id uuid references chat_messages (id) on delete set null, -- assistant message that carries the card
  case_id uuid references cases (id) on delete cascade,
  document_id uuid references documents (id) on delete cascade,
  -- [{op_id, tool, args, summary_ar, source:{kind,message_id,document_id,page,quote}, quote_verified, status:'pending'|'confirmed'|'rejected'|'failed', result_id, error}]
  ops jsonb not null,
  status proposal_status not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id)
);
create index on proposals (thread_id, created_at);

create table llm_calls (
  id uuid primary key default gen_random_uuid(),
  office_id uuid references offices (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  thread_id uuid,
  document_id uuid,
  purpose text not null, -- 'chat' | 'doc_read_page' | 'doc_extract'
  provider text not null,
  model text not null,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(12, 6) not null default 0,
  latency_ms int,
  ok boolean not null,
  error text,
  created_at timestamptz not null default now()
);
create index on llm_calls (created_at);

-- ---------- RLS: same policy on every office table ----------
do $$
declare t text;
begin
  foreach t in array array['chat_threads','chat_messages','clients','cases','documents','document_pages',
    'case_parties','case_facts','case_requests','case_arguments','hearings','judgments','proposals']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy office_select on %I for select to authenticated using (office_id = current_office_id())', t);
    execute format('create policy office_insert on %I for insert to authenticated with check (office_id = current_office_id())', t);
    execute format('create policy office_update on %I for update to authenticated using (office_id = current_office_id()) with check (office_id = current_office_id())', t);
    execute format('create policy office_delete on %I for delete to authenticated using (office_id = current_office_id())', t);
  end loop;
end $$;

alter table offices enable row level security;
create policy own_office_select on offices for select to authenticated using (id = current_office_id());
create policy own_office_update on offices for update to authenticated using (id = current_office_id());

alter table office_members enable row level security;
create policy own_membership_select on office_members for select to authenticated using (office_id = current_office_id());

alter table llm_calls enable row level security;
create policy llm_calls_select on llm_calls for select to authenticated using (office_id = current_office_id());
create policy llm_calls_insert on llm_calls for insert to authenticated with check (office_id = current_office_id() and user_id = auth.uid());

-- ---------- hearing decision: one place for «postponed to X creates the next hearing» ----------
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
    decided_at = now()
  where id = h.id;

  if p_decision = 'reserved_for_judgment' then
    update cases set status = 'reserved_for_judgment', updated_at = now() where id = h.case_id;
  elsif p_decision = 'judgment' then
    update cases set status = 'judged', updated_at = now() where id = h.case_id;
  end if;

  return jsonb_build_object('hearing_id', h.id, 'next_hearing_id', nxt);
end $$;
grant execute on function record_hearing_decision to authenticated;

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 26214400)
on conflict (id) do nothing;

create policy docs_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = current_office_id()::text);
create policy docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = current_office_id()::text);
create policy docs_update on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = current_office_id()::text);
create policy docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = current_office_id()::text);
