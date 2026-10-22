-- Appeal deadlines (item 5), behind the flag NEXT_PUBLIC_FEATURE_DEADLINES. A lawyer must check the rules before it is turned on.
-- Additive only (new tables and one function).
--
--   case_deadlines  = OFFICE table. One row per saved deadline (appeal or cassation) of a judgment, made by code after the lawyer's tap
--                     on «حطهم في الرول»: the period in days read from the article text, the last day, and which article text it came from
--                     (version, hash and the verbatim text). Same RLS as every office table (current_office_id()).
--   holidays        = SHARED table for all offices: official Egyptian holidays. Every authenticated user reads it; only an admin writes it.
--   holiday_reports = OFFICE table: an office reports a missing holiday; it reads its own reports, an admin reads and decides all of them.
--   app_admins      = SHARED: who is an admin. Nobody can read or write it from the app (no policy, no grant); only is_admin() reads it.
--
-- Everything seeded in `holidays` is a DRAFT («محتاج مراجعة»): the owner approves it in /settings/holidays. Code uses APPROVED rows only.

-- ---------- admin ----------
create table app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table app_admins enable row level security; -- and no policy: nobody reads or writes it through the API
revoke all on app_admins from anon, authenticated;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_admins where user_id = auth.uid())
$$;
revoke all on function is_admin() from public;
grant execute on function is_admin() to authenticated;

-- the demo owner (looked up read-only by e-mail: demo@clausia.test)
insert into app_admins (user_id) values ('48157349-cf1e-4f3f-96de-cebaa1d56ed7') on conflict do nothing;

-- ---------- holidays (shared) ----------
create table holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  note text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users (id),
  constraint holidays_name_ck check (length(btrim(name)) > 0)
);
create index on holidays (status, holiday_date);
alter table holidays enable row level security;
create policy holidays_select on holidays for select to authenticated using (true);
create policy holidays_insert on holidays for insert to authenticated with check (is_admin());
create policy holidays_update on holidays for update to authenticated using (is_admin()) with check (is_admin());
create policy holidays_delete on holidays for delete to authenticated using (is_admin());

-- ---------- holiday reports (per office) ----------
create table holiday_reports (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  holiday_date date not null,
  name text not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id),
  constraint holiday_reports_name_ck check (length(btrim(name)) > 0)
);
create index on holiday_reports (office_id, created_at);
create index on holiday_reports (status, created_at);
alter table holiday_reports enable row level security;
create policy holiday_reports_select on holiday_reports for select to authenticated using (office_id = current_office_id() or is_admin());
create policy holiday_reports_insert on holiday_reports for insert to authenticated
  with check (office_id = current_office_id() and status = 'pending' and created_by = auth.uid());
create policy holiday_reports_update on holiday_reports for update to authenticated using (is_admin()) with check (is_admin());
-- no delete policy: a report is never deleted from the app

-- ---------- case deadlines (per office) ----------
create table case_deadlines (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  case_id uuid not null references cases (id) on delete cascade,
  judgment_id uuid not null references judgments (id) on delete cascade,
  kind text not null check (kind in ('appeal', 'cassation')),
  start_date date not null,                                                  -- the judgment date, or the date the judgment was served (art. 213)
  start_basis text not null check (start_basis in ('judgment_date', 'service_date')),
  days int not null check (days > 0),                                        -- read by code from the article text
  raw_last_day date not null,                                                -- start_date + days (art. 15), before any move
  last_day date not null,                                                    -- after moving off a Friday / an approved holiday (art. 18)
  urgent boolean not null default false,                                     -- art. 227: a matter that cannot wait (مستعجل); asked, never assumed
  holidays_reviewed boolean not null default false,                          -- false = the card said «راجع الإجازات» when it was saved
  law_source_id uuid not null,                                               -- LawMill source (قانون المرافعات 13/1968)
  article_number text not null,
  version_id uuid not null,                                                  -- the version in force on the judgment date
  article_sha256 text not null,
  article_text text not null,                                                -- the verbatim text the days were read from
  reminders int[] not null default '{}' check (cardinality(reminders) <= 8 and 0 < all (reminders) and 365 >= all (reminders)), -- days before the last day
  review_status item_status not null default 'confirmed',
  created_by_kind actor_kind not null default 'lawyer',
  source_kind source_kind not null default 'manual',
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  unique (judgment_id, kind)
);
create index on case_deadlines (office_id, last_day);
create index on case_deadlines (case_id);

do $$
declare t text;
begin
  foreach t in array array['case_deadlines']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy office_select on %I for select to authenticated using (office_id = current_office_id())', t);
    execute format('create policy office_insert on %I for insert to authenticated with check (office_id = current_office_id())', t);
    execute format('create policy office_update on %I for update to authenticated using (office_id = current_office_id()) with check (office_id = current_office_id())', t);
    execute format('create policy office_delete on %I for delete to authenticated using (office_id = current_office_id())', t);
  end loop;
end $$;

-- ---------- seed: 2026 and 2027 official holidays, ALL drafts. Dates of the lunar ones are estimates: «محتاج مراجعة» ----------
insert into holidays (holiday_date, name, note) values
  ('2026-01-07', 'عيد الميلاد المجيد', null),
  ('2026-01-25', 'عيد ثورة 25 يناير وعيد الشرطة', null),
  ('2026-03-20', 'عيد الفطر (اليوم الأول)', 'التاريخ تقريبي: بيتحدد برؤية الهلال وقرار رسمي'),
  ('2026-03-21', 'عيد الفطر (اليوم الثاني)', 'التاريخ تقريبي: بيتحدد برؤية الهلال وقرار رسمي'),
  ('2026-03-22', 'عيد الفطر (اليوم الثالث)', 'التاريخ تقريبي: بيتحدد برؤية الهلال وقرار رسمي'),
  ('2026-04-13', 'شم النسيم', null),
  ('2026-04-25', 'عيد تحرير سيناء', null),
  ('2026-05-01', 'عيد العمال', null),
  ('2026-05-26', 'وقفة عرفات', 'التاريخ تقريبي: بيتحدد برؤية الهلال وقرار رسمي'),
  ('2026-05-27', 'عيد الأضحى (اليوم الأول)', 'التاريخ تقريبي: بيتحدد برؤية الهلال وقرار رسمي'),
  ('2026-05-28', 'عيد الأضحى (اليوم الثاني)', 'التاريخ تقريبي: بيتحدد برؤية الهلال وقرار رسمي'),
  ('2026-05-29', 'عيد الأضحى (اليوم الثالث)', 'التاريخ تقريبي: بيتحدد برؤية الهلال وقرار رسمي'),
  ('2026-06-16', 'رأس السنة الهجرية', 'التاريخ تقريبي: بيتحدد برؤية الهلال وقرار رسمي'),
  ('2026-06-30', 'عيد ثورة 30 يونيو', null),
  ('2026-07-23', 'عيد ثورة 23 يوليو', null),
  ('2026-08-25', 'المولد النبوي الشريف', 'التاريخ تقريبي: بيتحدد برؤية الهلال وقرار رسمي'),
  ('2026-10-06', 'عيد القوات المسلحة', null),
  ('2027-01-07', 'عيد الميلاد المجيد', null),
  ('2027-01-25', 'عيد ثورة 25 يناير وعيد الشرطة', null),
  ('2027-03-10', 'عيد الفطر (اليوم الأول)', 'التاريخ تقريبي: بيتحدد برؤية الهلال وقرار رسمي'),
  ('2027-03-11', 'عيد الفطر (اليوم الثاني)', 'التاريخ تقريبي: بيتحدد برؤية الهلال وقرار رسمي'),
  ('2027-03-12', 'عيد الفطر (اليوم الثالث)', 'التاريخ تقريبي: بيتحدد برؤية الهلال وقرار رسمي'),
  ('2027-04-25', 'عيد تحرير سيناء', null),
  ('2027-05-01', 'عيد العمال', null),
  ('2027-05-03', 'شم النسيم', null),
  ('2027-05-15', 'وقفة عرفات', 'التاريخ تقريبي: بيتحدد برؤية الهلال وقرار رسمي'),
  ('2027-05-16', 'عيد الأضحى (اليوم الأول)', 'التاريخ تقريبي: بيتحدد برؤية الهلال وقرار رسمي'),
  ('2027-05-17', 'عيد الأضحى (اليوم الثاني)', 'التاريخ تقريبي: بيتحدد برؤية الهلال وقرار رسمي'),
  ('2027-05-18', 'عيد الأضحى (اليوم الثالث)', 'التاريخ تقريبي: بيتحدد برؤية الهلال وقرار رسمي'),
  ('2027-06-06', 'رأس السنة الهجرية', 'التاريخ تقريبي: بيتحدد برؤية الهلال وقرار رسمي'),
  ('2027-06-30', 'عيد ثورة 30 يونيو', null),
  ('2027-07-23', 'عيد ثورة 23 يوليو', null),
  ('2027-08-15', 'المولد النبوي الشريف', 'التاريخ تقريبي: بيتحدد برؤية الهلال وقرار رسمي'),
  ('2027-10-06', 'عيد القوات المسلحة', null)
on conflict (holiday_date) do nothing;
