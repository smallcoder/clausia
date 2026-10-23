-- PR 5 (الحسابات): READ-ONLY dry run for supabase/migrations/20261025100000_accounts.sql. Only SELECTs. Run: scripts/sql.sh -f scripts/accounts-dry-run.sql
-- Shows (1) that none of the new objects exists yet, (2) a row count + checksum of every existing table the app writes to, and the policy count of every
-- existing table. Run it again after the migration: the "existing" part must be byte-for-byte the same.
select jsonb_pretty(jsonb_build_object(
  'new_tables_exist', jsonb_build_object('case_fees', to_regclass('public.case_fees') is not null, 'account_movements', to_regclass('public.account_movements') is not null),
  'new_types_exist', (select coalesce(jsonb_agg(typname order by typname), '[]'::jsonb) from pg_type where typnamespace = 'public'::regnamespace and typname in ('money_kind', 'money_method', 'money_charge', 'fee_kind')),
  'new_functions_exist', (select coalesce(jsonb_agg(proname order by proname), '[]'::jsonb) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('account_movements_check_links', 'case_fees_check_links')),
  'existing_rows', jsonb_build_object(
    'clients',       (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from clients t),
    'cases',         (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from cases t),
    'case_parties',  (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from case_parties t),
    'documents',     (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from documents t),
    'hearings',      (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from hearings t),
    'chat_threads',  (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from chat_threads t),
    'chat_messages', (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from chat_messages t),
    'proposals',     (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from proposals t)),
  'existing_policies', (select jsonb_object_agg(tablename, n order by tablename) from (
      select tablename, count(*) n, md5(string_agg(policyname || cmd || coalesce(qual, '') || coalesce(with_check, ''), '|' order by policyname)) h from pg_policies
      where schemaname = 'public' and tablename not in ('case_fees', 'account_movements') group by tablename) p)
)) as dry_run;
