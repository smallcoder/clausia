-- PR 5 (الحسابات): APPLIED to the project database (by hand, after a read-only dry run and a rolled-back rehearsal: scripts/sql.sh -f <this file>). The way back is 20261025100000_accounts_down.sql (never run by a tool).
--
-- ADDITIVE ONLY: two new tables, four new enums, two new trigger functions. No existing table, column, row, policy or function is touched.
--
--   case_fees         = OFFICE table. The fee agreed for ONE case: kind 'fixed' (with an amount) or 'open' («مفتوحة»: no amount, so no balance).
--                       No row = the fee was never set (it is optional). One row per case (unique).
--   account_movements = OFFICE table. One receipt or one expense of a CLIENT, on one of the client's cases or on the client's general account
--                       (case_id null). An expense is charged to the client or to the office (charged_to); a receipt has no charged_to.
--
-- MONEY IS INTEGER PIASTERS (bigint), never a float: 1 EGP = 100 piasters. The check keeps every amount in 1 .. 10^12 piasters (10 billion EGP),
-- far below 2^53, so the API's JSON numbers carry it exactly.
--
-- RLS: the standard per-table office policies, the same four as `clients` (office_id = current_office_id()).
-- A foreign key alone would accept another office's id (FKs are not filtered by RLS), so a before-insert/update trigger (security INVOKER: its selects
-- go through RLS) checks that the client and the case are visible, belong to the row's office, and that the case belongs to the movement's client.
-- Deleting a client or a case that has movements is refused (on delete restrict): money rows never disappear silently.

create type money_kind as enum ('receipt', 'expense');
create type money_method as enum ('cash', 'vodafone_cash', 'instapay', 'bank_transfer', 'cheque');
create type money_charge as enum ('client', 'office');
create type fee_kind as enum ('fixed', 'open');

-- ---------- fees ----------
create table case_fees (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  case_id uuid not null references cases (id) on delete cascade,
  kind fee_kind not null,
  amount_piasters bigint,
  review_status item_status not null default 'confirmed',
  created_by_kind actor_kind not null default 'lawyer',
  source_kind source_kind not null default 'manual',
  source_message_id uuid references chat_messages (id) on delete set null,
  source_document_id uuid references documents (id) on delete set null,
  source_page int,
  source_quote text,
  source_char_start int,
  source_char_end int,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint case_fees_one_per_case unique (case_id),
  constraint case_fees_amount_ck check (
    (kind = 'fixed' and amount_piasters is not null and amount_piasters between 1 and 1000000000000) or (kind = 'open' and amount_piasters is null)),
  constraint case_fees_source_span_ck check (
    (source_char_start is null and source_char_end is null) or (source_char_start >= 0 and source_char_end > source_char_start))
);

-- ---------- movements ----------
create table account_movements (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  client_id uuid not null references clients (id) on delete restrict,
  case_id uuid references cases (id) on delete restrict, -- null = the client's general account
  kind money_kind not null,
  amount_piasters bigint not null check (amount_piasters between 1 and 1000000000000),
  method money_method not null,
  moved_on date not null,
  charged_to money_charge, -- expenses only
  note text,
  review_status item_status not null default 'confirmed',
  created_by_kind actor_kind not null default 'lawyer',
  source_kind source_kind not null default 'manual',
  source_message_id uuid references chat_messages (id) on delete set null,
  source_document_id uuid references documents (id) on delete set null,
  source_page int,
  source_quote text,
  source_char_start int,
  source_char_end int,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  constraint account_movements_charge_ck check ((kind = 'expense' and charged_to is not null) or (kind = 'receipt' and charged_to is null)),
  constraint account_movements_source_span_ck check (
    (source_char_start is null and source_char_end is null) or (source_char_start >= 0 and source_char_end > source_char_start))
);
create index account_movements_client_idx on account_movements (client_id, moved_on desc, created_at desc);
create index account_movements_case_idx on account_movements (case_id);

-- ---------- link checks (security invoker: the selects below go through RLS, so a row of another office is simply not found) ----------
create or replace function account_movements_check_links() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from clients where id = new.client_id and office_id = new.office_id) then
    raise exception 'client not found';
  end if;
  if new.case_id is not null and not exists (select 1 from cases where id = new.case_id and office_id = new.office_id and client_id = new.client_id) then
    raise exception 'case not found for this client';
  end if;
  return new;
end $$;
create trigger account_movements_check_links before insert or update of client_id, case_id on account_movements
  for each row execute function account_movements_check_links();

create or replace function case_fees_check_links() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from cases where id = new.case_id and office_id = new.office_id) then
    raise exception 'case not found';
  end if;
  return new;
end $$;
create trigger case_fees_check_links before insert or update of case_id on case_fees
  for each row execute function case_fees_check_links();

-- ---------- RLS: the same four policies as every office table ----------
do $$
declare t text;
begin
  foreach t in array array['case_fees', 'account_movements'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy office_select on %I for select to authenticated using (office_id = current_office_id())', t);
    execute format('create policy office_insert on %I for insert to authenticated with check (office_id = current_office_id())', t);
    execute format('create policy office_update on %I for update to authenticated using (office_id = current_office_id()) with check (office_id = current_office_id())', t);
    execute format('create policy office_delete on %I for delete to authenticated using (office_id = current_office_id())', t);
  end loop;
end $$;
