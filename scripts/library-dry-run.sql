-- PR 6 (المكتبة): READ-ONLY dry run for supabase/migrations/20261026100000_library.sql. Only SELECTs. Run: scripts/sql.sh -f scripts/library-dry-run.sql
-- Shows (1) that none of the new objects exists yet, (2) a row count + checksum of every existing table the app writes to (the accounts tables included),
-- the policy count of every existing table, and the storage policies + the «documents» bucket settings. Run it again after the migration: the "existing" part must
-- be byte-for-byte the same.
select jsonb_pretty(jsonb_build_object(
  'new_tables_exist', jsonb_build_object('templates', to_regclass('public.templates') is not null, 'drafts', to_regclass('public.drafts') is not null, 'office_style', to_regclass('public.office_style') is not null),
  'new_types_exist', (select coalesce(jsonb_agg(typname order by typname), '[]'::jsonb) from pg_type where typnamespace = 'public'::regnamespace and typname in ('template_category')),
  'new_functions_exist', (select coalesce(jsonb_agg(proname order by proname), '[]'::jsonb) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('drafts_check_links')),
  'existing_rows', jsonb_build_object(
    'clients',           (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from clients t),
    'cases',             (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from cases t),
    'case_parties',      (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from case_parties t),
    'case_facts',        (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from case_facts t),
    'judgments',         (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from judgments t),
    'documents',         (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from documents t),
    'hearings',          (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from hearings t),
    'chat_threads',      (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from chat_threads t),
    'chat_messages',     (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from chat_messages t),
    'proposals',         (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from proposals t),
    'case_fees',         (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from case_fees t),
    'account_movements', (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from account_movements t)),
  'existing_policies', (select jsonb_object_agg(tablename, n order by tablename) from (
      select tablename, count(*) n, md5(string_agg(policyname || cmd || coalesce(qual, '') || coalesce(with_check, ''), '|' order by policyname)) h from pg_policies
      where schemaname = 'public' and tablename not in ('templates', 'drafts', 'office_style') group by tablename) p),
  'storage_policies', (select md5(string_agg(policyname || cmd || coalesce(qual, '') || coalesce(with_check, ''), '|' order by policyname)) from pg_policies where schemaname = 'storage' and tablename = 'objects'),
  'storage_policy_names', (select coalesce(jsonb_agg(policyname order by policyname), '[]'::jsonb) from pg_policies where schemaname = 'storage' and tablename = 'objects'),
  'documents_bucket', (select to_jsonb(b) - 'created_at' - 'updated_at' - 'owner' - 'owner_id' - 'id' from storage.buckets b where b.id = 'documents'),
  'storage_objects', (select count(*) from storage.objects where bucket_id = 'documents')
)) as dry_run;
