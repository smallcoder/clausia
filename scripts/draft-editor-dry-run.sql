-- PR 7 (محرر المذكرة): READ-ONLY dry run for supabase/migrations/20261027100000_draft_versions.sql. Only SELECTs. Run: scripts/sql.sh -f scripts/draft-editor-dry-run.sql
-- Shows (1) that the new objects do not exist yet and that the tables the migration points at (drafts, offices) do, (2) a row count + checksum of every existing
-- table the app writes to, the policy count of every existing table, the storage policies. Run it again after the migration: the "existing" part must be
-- byte-for-byte the same, and only the new table (0 rows, 3 policies) is added.
select jsonb_pretty(jsonb_build_object(
  'new_table_exists', to_regclass('public.draft_versions') is not null,
  'new_function_exists', exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'draft_versions_check_links'),
  'needed_tables_exist', jsonb_build_object('drafts', to_regclass('public.drafts') is not null, 'offices', to_regclass('public.offices') is not null),
  'needed_function_exists', exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'current_office_id'),
  'existing_rows', jsonb_build_object(
    'clients',           (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from clients t),
    'cases',             (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from cases t),
    'documents',         (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from documents t),
    'judgments',         (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from judgments t),
    'chat_threads',      (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from chat_threads t),
    'chat_messages',     (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from chat_messages t),
    'proposals',         (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from proposals t),
    'templates',         (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from templates t),
    'drafts',            (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from drafts t),
    'office_style',      (select jsonb_build_object('rows', count(*), 'md5', coalesce(md5(string_agg(t::text, '|' order by t.id)), '')) from office_style t)),
  'existing_policies', (select coalesce(jsonb_object_agg(tablename, n order by tablename), '{}'::jsonb) from (
      select tablename, count(*) n from pg_policies where schemaname = 'public' and tablename <> 'draft_versions' group by tablename) p),
  'existing_policies_md5', (select md5(string_agg(tablename || policyname || cmd || coalesce(qual, '') || coalesce(with_check, ''), '|' order by tablename, policyname)) from pg_policies where schemaname = 'public' and tablename <> 'draft_versions'),
  'storage_policies_md5', (select md5(string_agg(policyname || cmd || coalesce(qual, '') || coalesce(with_check, ''), '|' order by policyname)) from pg_policies where schemaname = 'storage' and tablename = 'objects'),
  'drafts_columns', (select jsonb_agg(column_name order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'drafts'),
  'drafts_with_non_object_or_blockless_body', (select count(*) from drafts where not (jsonb_typeof(body) = 'object' and coalesce(jsonb_typeof(body -> 'blocks'), '') = 'array'))
)) as dry_run;
