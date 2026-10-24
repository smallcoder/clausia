-- PR 6 (المكتبة + ورق المكتب + Word): to be APPLIED by hand after a read-only dry run and a rolled-back rehearsal: scripts/sql.sh -f <this file>.
-- The way back is 20261026100000_library_down.sql (never run by a tool).
--
-- ADDITIVE ONLY: three new tables, one new enum, one new trigger function, and the base templates as rows of the NEW templates table.
-- No existing table, column, row, policy or function is touched. No new storage bucket and no storage policy: uploaded Word files go in the
-- EXISTING «documents» bucket under the existing path convention {office_id}/…, which the four existing docs_* policies already cover.
--
--   templates    = a «صيغة». office_id NULL = a BASE template shared by every office (readable by all, writable by no one through the app);
--                  office_id set   = the lawyer's own template (an uploaded .docx, «مكتبك»).
--                  body = {version, blocks[], manual[]}: plain structure with {{placeholders}} and EMPTY lawyer sections (grounds, requests).
--                  Nothing in a base template is copied from a book, a database or a web page: written for this app, structure only.
--                  needs_lawyer_review = true on every base template until a lawyer has read it.
--   drafts       = OFFICE table. A draft made from a template for ONE case: the resolved blocks, and what was filled (with its source),
--                  what is missing, and which sections the lawyer still has to write or confirm. Shown in the case's «المذكرات والأحكام» tab.
--   office_style = OFFICE table, one row per office: the header, footer, fonts and margins read from a Word file the lawyer uploaded («ورق المكتب»).
--
-- Use counts of a template are NOT a column (a base row cannot be counted per office): they are counted from drafts.
--
-- RLS: drafts and office_style get the standard four office policies (office_id = current_office_id()), like `clients`.
-- templates: SELECT is `office_id is null or office_id = current_office_id()`; INSERT / UPDATE / DELETE are the standard office check
-- (office_id = current_office_id()), which a NULL office_id can never satisfy, so a base template cannot be added, changed or removed with
-- the app's key. (The one deliberate difference from the other office tables: the read policy also shows the NULL-office rows.)
-- A foreign key alone would accept another office's id (FKs are not filtered by RLS), so a before-insert/update trigger (security INVOKER: its
-- selects go through RLS) checks that the case and the template are visible and belong to the draft's office.
-- Deleting a case that has drafts is refused (on delete restrict): a draft is work product and never disappears silently.

create type template_category as enum ('claim', 'appeal', 'memo', 'notice', 'contract');

-- ---------- templates ----------
create table templates (
  id uuid primary key default gen_random_uuid(),
  office_id uuid references offices (id) on delete cascade, -- NULL = a base template shared by all offices
  slug text, -- stable name of a base template (null for an office's own)
  name text not null,
  category template_category not null,
  description text not null default '',
  body jsonb not null,
  storage_path text, -- an uploaded .docx, in the «documents» bucket: {office_id}/templates/{id}/…
  needs_lawyer_review boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint templates_name_ck check (length(btrim(name)) between 2 and 120),
  constraint templates_body_ck check (jsonb_typeof(body) = 'object' and coalesce(jsonb_typeof(body -> 'blocks'), '') = 'array'),
  constraint templates_base_ck check ((office_id is null and slug is not null and storage_path is null) or office_id is not null),
  constraint templates_path_ck check (storage_path is null or storage_path like office_id::text || '/%')
);
create unique index templates_base_slug_idx on templates (slug) where office_id is null;
create index templates_office_idx on templates (office_id);

-- ---------- drafts ----------
create table drafts (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  case_id uuid not null references cases (id) on delete restrict,
  template_id uuid references templates (id) on delete set null,
  template_name text not null, -- the name when the draft was made (the template may be renamed or removed later)
  title text not null,
  body jsonb not null, -- resolved blocks; a value the file did not have stays as {{key}}
  fill jsonb not null, -- {filled[{key,label,value,source}], missing[{key,label,reason}], lawyer[{key,heading,state}]}
  needs_lawyer_review boolean not null default false,
  review_status item_status not null default 'confirmed',
  created_by_kind actor_kind not null default 'lawyer',
  source_kind source_kind not null default 'manual',
  source_message_id uuid references chat_messages (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drafts_title_ck check (length(btrim(title)) between 2 and 200),
  constraint drafts_body_ck check (jsonb_typeof(body) = 'object' and coalesce(jsonb_typeof(body -> 'blocks'), '') = 'array'),
  constraint drafts_fill_ck check (jsonb_typeof(fill) = 'object')
);
create index drafts_case_idx on drafts (case_id, created_at desc);
create index drafts_template_idx on drafts (template_id);

-- ---------- office style ----------
create table office_style (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null default current_office_id() references offices (id) on delete cascade,
  file_name text not null,
  storage_path text not null, -- the Word file the style was read from: {office_id}/office-style/{id}/…
  style jsonb not null, -- {header{lines[]}, footer{lines[]}, fonts{body,…}, margins{top,bottom,left,right (twips)}, page{w,h}}
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint office_style_one_per_office unique (office_id),
  constraint office_style_style_ck check (jsonb_typeof(style) = 'object'),
  constraint office_style_path_ck check (storage_path like office_id::text || '/%')
);

-- ---------- link checks (security invoker: the selects below go through RLS, so a row of another office is simply not found) ----------
create or replace function drafts_check_links() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from cases where id = new.case_id and office_id = new.office_id) then
    raise exception 'case not found';
  end if;
  if new.template_id is not null and not exists (select 1 from templates where id = new.template_id and (office_id is null or office_id = new.office_id)) then
    raise exception 'template not found';
  end if;
  return new;
end $$;
create trigger drafts_check_links before insert or update of case_id, template_id on drafts
  for each row execute function drafts_check_links();

-- ---------- RLS ----------
alter table templates enable row level security;
create policy templates_select on templates for select to authenticated using (office_id is null or office_id = current_office_id());
create policy templates_insert on templates for insert to authenticated with check (office_id = current_office_id());
create policy templates_update on templates for update to authenticated using (office_id = current_office_id()) with check (office_id = current_office_id());
create policy templates_delete on templates for delete to authenticated using (office_id = current_office_id());

do $$
declare t text;
begin
  foreach t in array array['drafts', 'office_style'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy office_select on %I for select to authenticated using (office_id = current_office_id())', t);
    execute format('create policy office_insert on %I for insert to authenticated with check (office_id = current_office_id())', t);
    execute format('create policy office_update on %I for update to authenticated using (office_id = current_office_id()) with check (office_id = current_office_id())', t);
    execute format('create policy office_delete on %I for delete to authenticated using (office_id = current_office_id())', t);
  end loop;
end $$;

-- ---------- the base templates (new rows of the NEW table) ----------
-- Plain structure only. {{key}} = a value the app fills from the case file when the file has it (and says where it came from); a value the file
-- does not have stays empty and is listed as needed. {"t":"lawyer"} = a section that is ALWAYS empty: the legal grounds and the requests are the lawyer's.
-- manual[] = placeholders the case file never holds (they are left empty and listed as needed).
insert into templates (slug, name, category, description, needs_lawyer_review, body) values
('claim-sheet', 'صحيفة دعوى', 'claim', 'هيكل صحيفة دعوى: المحكمة والخصوم والوقائع، وأسباب الدعوى والطلبات فاضية للمحامي.', true, $j$
{"version":1,"blocks":[
 {"t":"title","text":"صحيفة دعوى"},
 {"t":"p","text":"المحكمة: {{court}}"},
 {"t":"p","text":"الدائرة: {{circuit}}"},
 {"t":"p","text":"رقم الدعوى: {{case_number}}"},
 {"t":"h","text":"أطراف الدعوى"},
 {"t":"p","text":"المدعي: {{our_parties}}"},
 {"t":"p","text":"المدعى عليه: {{opponents}}"},
 {"t":"h","text":"الوقائع"},
 {"t":"p","text":"{{facts_summary}}"},
 {"t":"lawyer","key":"grounds","heading":"أسباب الدعوى","hint":"يكتبها المحامي"},
 {"t":"lawyer","key":"requests","heading":"الطلبات","hint":"يكتبها المحامي"},
 {"t":"p","text":"وكيل المدعي: {{lawyer_name}}"}
],"manual":[{"key":"lawyer_name","label":"اسم المحامي"}]}
$j$::jsonb),
('appeal-sheet', 'صحيفة استئناف', 'appeal', 'هيكل صحيفة استئناف: الحكم المستأنف وأطراف الاستئناف والوقائع، وأسباب الاستئناف والطلبات فاضية للمحامي.', true, $j$
{"version":1,"blocks":[
 {"t":"title","text":"صحيفة استئناف"},
 {"t":"p","text":"محكمة الاستئناف: {{court}}"},
 {"t":"p","text":"الدائرة: {{circuit}}"},
 {"t":"p","text":"رقم الاستئناف: {{case_number}}"},
 {"t":"h","text":"الحكم المستأنف"},
 {"t":"p","text":"الدعوى المستأنف حكمها: {{appealed_case}}"},
 {"t":"p","text":"تاريخ الحكم: {{judgment_date}}"},
 {"t":"p","text":"منطوق الحكم: {{judgment_text}}"},
 {"t":"h","text":"أطراف الاستئناف"},
 {"t":"p","text":"المستأنف: {{our_parties}}"},
 {"t":"p","text":"المستأنف ضده: {{opponents}}"},
 {"t":"h","text":"الوقائع"},
 {"t":"p","text":"{{facts_summary}}"},
 {"t":"lawyer","key":"grounds","heading":"أسباب الاستئناف","hint":"يكتبها المحامي"},
 {"t":"lawyer","key":"requests","heading":"الطلبات","hint":"يكتبها المحامي"},
 {"t":"p","text":"وكيل المستأنف: {{lawyer_name}}"}
],"manual":[{"key":"lawyer_name","label":"اسم المحامي"}]}
$j$::jsonb),
('cassation-report', 'تقرير طعن بالنقض', 'appeal', 'هيكل تقرير طعن بالنقض: الحكم المطعون فيه والخصوم والوقائع، وأسباب الطعن والطلبات فاضية للمحامي.', true, $j$
{"version":1,"blocks":[
 {"t":"title","text":"تقرير بالطعن بالنقض"},
 {"t":"p","text":"الدائرة: {{circuit}}"},
 {"t":"p","text":"رقم الدعوى: {{case_number}}"},
 {"t":"h","text":"الحكم المطعون فيه"},
 {"t":"p","text":"الدعوى: {{appealed_case}}"},
 {"t":"p","text":"تاريخ الحكم: {{judgment_date}}"},
 {"t":"p","text":"منطوق الحكم: {{judgment_text}}"},
 {"t":"h","text":"أطراف الطعن"},
 {"t":"p","text":"الطاعن: {{our_parties}}"},
 {"t":"p","text":"المطعون ضده: {{opponents}}"},
 {"t":"h","text":"الوقائع"},
 {"t":"p","text":"{{facts_summary}}"},
 {"t":"lawyer","key":"grounds","heading":"أسباب الطعن","hint":"يكتبها المحامي"},
 {"t":"lawyer","key":"requests","heading":"الطلبات","hint":"يكتبها المحامي"},
 {"t":"p","text":"المحامي بالنقض: {{lawyer_name}}"}
],"manual":[{"key":"lawyer_name","label":"اسم المحامي"}]}
$j$::jsonb),
('defense-memo', 'مذكرة بدفاع', 'memo', 'هيكل مذكرة بدفاع: بيانات الدعوى والخصوم والوقائع، والدفاع والطلبات فاضيين للمحامي.', true, $j$
{"version":1,"blocks":[
 {"t":"title","text":"مذكرة بدفاع"},
 {"t":"p","text":"المحكمة: {{court}}"},
 {"t":"p","text":"الدائرة: {{circuit}}"},
 {"t":"p","text":"في الدعوى رقم: {{case_number}}"},
 {"t":"p","text":"لجلسة: {{next_hearing}}"},
 {"t":"p","text":"مقدمة من: {{our_parties}}"},
 {"t":"p","text":"ضد: {{opponents}}"},
 {"t":"h","text":"الوقائع"},
 {"t":"p","text":"{{facts_summary}}"},
 {"t":"lawyer","key":"grounds","heading":"الدفاع","hint":"يكتبه المحامي"},
 {"t":"lawyer","key":"requests","heading":"الطلبات","hint":"يكتبها المحامي"},
 {"t":"p","text":"وكيل المقدم: {{lawyer_name}}"}
],"manual":[{"key":"lawyer_name","label":"اسم المحامي"}]}
$j$::jsonb),
('notice-bailiff', 'إنذار على يد محضر', 'notice', 'هيكل إنذار على يد محضر: المنذر والمنذر إليه والوقائع، والمطلوب فاضي للمحامي.', true, $j$
{"version":1,"blocks":[
 {"t":"title","text":"إنذار على يد محضر"},
 {"t":"p","text":"المنذر: {{client}}"},
 {"t":"p","text":"المنذر إليه: {{opponents}}"},
 {"t":"h","text":"الوقائع"},
 {"t":"p","text":"{{facts_summary}}"},
 {"t":"lawyer","key":"grounds","heading":"المطلوب من المنذر إليه","hint":"يكتبه المحامي"},
 {"t":"lawyer","key":"requests","heading":"المهلة والإجراء عند عدم التنفيذ","hint":"يكتبهما المحامي"},
 {"t":"p","text":"وكيل المنذر: {{lawyer_name}}"}
],"manual":[{"key":"lawyer_name","label":"اسم المحامي"}]}
$j$::jsonb),
('power-of-attorney', 'توكيل خاص', 'contract', 'هيكل توكيل خاص: بيانات الموكل والوكيل والدعوى، وحدود الوكالة فاضية للمحامي.', true, $j$
{"version":1,"blocks":[
 {"t":"title","text":"توكيل خاص"},
 {"t":"p","text":"أنا الموقع أدناه: {{client}}"},
 {"t":"p","text":"الرقم القومي: {{client_national_id}}"},
 {"t":"p","text":"العنوان: {{client_address}}"},
 {"t":"p","text":"وكّلت الأستاذ: {{agent_name}}"},
 {"t":"p","text":"في الدعوى: {{case_number}} — {{court}}"},
 {"t":"lawyer","key":"grounds","heading":"حدود الوكالة","hint":"يكتبها المحامي"},
 {"t":"lawyer","key":"requests","heading":"مدة التوكيل وأي شروط","hint":"يكتبها المحامي"}
],"manual":[{"key":"client_national_id","label":"الرقم القومي للموكل"},{"key":"client_address","label":"عنوان الموكل"},{"key":"agent_name","label":"اسم الوكيل (المحامي)"}]}
$j$::jsonb);
