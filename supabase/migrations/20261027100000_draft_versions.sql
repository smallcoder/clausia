-- PR 7 (محرر المذكرة): to be APPLIED by hand after a read-only dry run and a rolled-back rehearsal: scripts/sql.sh -f <this file>.
-- The way back is 20261027100000_draft_versions_down.sql (never run by a tool).
--
-- ADDITIVE ONLY: ONE new table, ONE new trigger function. No existing table, column, row, policy, function or storage object is touched.
-- (`drafts` keeps its columns: the editor writes the same `body` jsonb, whose blocks may now carry optional `id`, `marks`, `dir`: the existing
-- check `drafts_body_ck` only needs «body is an object with a blocks array», which still holds.)
--
--   draft_versions = OFFICE table. One row per saved state of a draft: the whole body as it was after that save.
--                    kind: 'original' (the body before the first edit; made lazily), 'save' (the lawyer's save / autosave), 'accept' (a change Clausia
--                    proposed and the lawyer accepted), 'restore' (an old version made current again), 'import' (the draft was opened from a Word file).
--                    A restore is a NEW row (restored_from = the version it copied): nothing is ever deleted by the app to «go back».
--                    Versions are immutable: there is NO update policy. The delete policy exists only so a save that fails half way can remove the row
--                    it just inserted (the app saves all or nothing) and so a draft's versions go with the draft (on delete cascade).
--
-- RLS: select / insert / delete = the standard office check (office_id = current_office_id()). A foreign key alone would accept another office's draft
-- id (FKs are not filtered by RLS), so a before-insert trigger (security INVOKER: its selects go through RLS) checks that the draft is visible and of the
-- row's office, and that restored_from is a version of the SAME draft.

create table draft_versions (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  draft_id uuid not null references drafts (id) on delete cascade,
  body jsonb not null,
  kind text not null,
  note text, -- accept: the short reason Clausia gave for the change
  restored_from uuid references draft_versions (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  constraint draft_versions_kind_ck check (kind in ('original', 'save', 'accept', 'restore', 'import')),
  constraint draft_versions_body_ck check (jsonb_typeof(body) = 'object' and coalesce(jsonb_typeof(body -> 'blocks'), '') = 'array'),
  constraint draft_versions_note_ck check (note is null or length(note) <= 300)
);
create index draft_versions_draft_idx on draft_versions (draft_id, created_at desc);

create or replace function draft_versions_check_links() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from drafts where id = new.draft_id and office_id = new.office_id) then
    raise exception 'draft not found';
  end if;
  if new.restored_from is not null and not exists (select 1 from draft_versions where id = new.restored_from and draft_id = new.draft_id) then
    raise exception 'version not found';
  end if;
  return new;
end $$;
create trigger draft_versions_check_links before insert on draft_versions
  for each row execute function draft_versions_check_links();

alter table draft_versions enable row level security;
create policy office_select on draft_versions for select to authenticated using (office_id = current_office_id());
create policy office_insert on draft_versions for insert to authenticated with check (office_id = current_office_id());
create policy office_delete on draft_versions for delete to authenticated using (office_id = current_office_id());
