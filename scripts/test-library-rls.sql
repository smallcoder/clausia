-- PR 6 (المكتبة): the RLS test for templates (with the read-only shared BASE templates), drafts and office_style, and for the EXISTING storage policies
-- on the «documents» bucket (the new Word-file paths reuse them: no storage policy is added). ONE transaction, ROLLED BACK: nothing persists.
-- Run: scripts/sql.sh -f scripts/test-library-rls.sql
-- (Before the migration is applied, scripts/library-rls-rehearsal.sh runs the migration SQL inside the same transaction, then this test.)
--
-- The DO block ends with `raise exception 'RLS TEST RESULT ...'`, so the report comes back as the error text AND the transaction cannot commit,
-- even if the trailing rollback were lost. Each "must fail" case runs in its own sub-block (a failed statement would abort the transaction otherwise).
-- The rows it needs from the OTHER office (a client, a case, a template: that office has none) are made here, as the table owner, inside the transaction.
begin;

do $$
declare
  demo_user uuid := '48157349-cf1e-4f3f-96de-cebaa1d56ed7';
  demo_office uuid := '3d6f1860-3a1c-4ee3-babb-21cb05e57a76';
  other_user uuid := '2331727a-8fb2-4095-ae00-f55b5431cc18';
  other_office uuid := 'a5fe61a0-36c7-42cc-b252-0503db8e61a8';
  demo_client uuid; demo_case uuid; other_client uuid; other_case uuid; other_tpl uuid;
  base_id uuid; base_n int; own_tpl uuid; draft_id uuid; draft2_id uuid; style_id uuid; other_draft uuid;
  n int; res text := '';
  fails int := 0;
begin
  select c.client_id, c.id into demo_client, demo_case from cases c where c.office_id = demo_office and c.client_id is not null order by c.created_at limit 1;
  insert into clients (office_id, name) values (other_office, 'موكل المكتب الآخر (اختبار)') returning id into other_client;
  insert into cases (office_id, client_id, title) values (other_office, other_client, 'دعوى المكتب الآخر (اختبار)') returning id into other_case;
  insert into templates (office_id, name, category, body) values (other_office, 'صيغة المكتب الآخر (اختبار)', 'memo', '{"version":1,"blocks":[]}'::jsonb) returning id into other_tpl;
  select count(*), min(id::text)::uuid into base_n, base_id from templates where office_id is null;
  res := res || format('setup: demo case %s, other case %s, other office template %s; %s base templates in the table (as the owner)', demo_case, other_case, other_tpl, base_n) || E'\n';
  if base_n < 6 then res := res || 'FAIL fewer than 6 base templates were seeded' || E'\n'; fails := fails + 1; else res := res || format('PASS %s base templates were seeded', base_n) || E'\n'; end if;
  select count(*) into n from templates where office_id is null and not needs_lawyer_review;
  res := res || format('%s every base template is marked needs_lawyer_review (%s are not)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  select count(*) into n from templates t where office_id is null and (select count(*) from jsonb_array_elements(t.body -> 'blocks') b where b ->> 't' = 'lawyer' and b ->> 'key' = 'grounds') = 0;
  res := res || format('%s every base template has an EMPTY «grounds» section for the lawyer (%s have none)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  select count(*) into n from templates t, jsonb_array_elements(t.body -> 'blocks') b where t.office_id is null and b ->> 't' = 'lawyer' and (b ? 'text' and length(coalesce(b ->> 'text', '')) > 0);
  res := res || format('%s no lawyer section of a base template carries text (%s do)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;

  ---------------------------------------------------------------- the DEMO office user
  perform set_config('request.jwt.claims', json_build_object('sub', demo_user, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n from templates where office_id is null; res := res || format('%s demo reads all %s base templates (office_id null)', case when n = base_n then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> base_n then fails := fails + 1; end if;
  select count(*) into n from templates where id = other_tpl; res := res || format('%s demo cannot read the other office''s template (%s rows)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  select count(*) into n from templates; res := res || format('%s demo sees base + its own only (%s rows; expect %s)', case when n = base_n then 'PASS' else 'FAIL' end, n, base_n) || E'\n'; if n <> base_n then fails := fails + 1; end if;

  -- the base templates are read-only through the app
  begin insert into templates (office_id, slug, name, category, body) values (null, 'x-test', 'صيغة أساسية جديدة', 'memo', '{"version":1,"blocks":[]}'::jsonb); res := res || 'FAIL demo inserted a BASE template' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS demo cannot insert a base template (office_id null): ' || sqlerrm || E'\n'; end;
  begin insert into templates (slug, name, category, body) values ('x-test2', 'صيغة بلا مكتب', 'memo', '{"version":1,"blocks":[]}'::jsonb); res := res || 'FAIL demo inserted a template with no office_id' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS demo cannot insert a template with no office_id: ' || sqlerrm || E'\n'; end;
  update templates set name = 'غيّرتها' where id = base_id; get diagnostics n = row_count;
  res := res || format('%s demo cannot update a base template (%s rows)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  delete from templates where id = base_id; get diagnostics n = row_count;
  res := res || format('%s demo cannot delete a base template (%s rows)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  delete from templates where office_id is null; get diagnostics n = row_count;
  res := res || format('%s demo cannot delete ANY base template (%s rows)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;

  -- its own template
  insert into templates (office_id, name, category, body, storage_path) values (demo_office, 'صيغة مكتب الاختبار', 'memo', '{"version":1,"blocks":[{"t":"p","text":"x"}]}'::jsonb, demo_office::text || '/templates/t1/x.docx') returning id into own_tpl;
  res := res || 'PASS demo inserts its own office template (office_id = its office, storage path under its office folder)' || E'\n';
  begin insert into templates (office_id, name, category, body) values (other_office, 'صيغة في المكتب الآخر', 'memo', '{"version":1,"blocks":[]}'::jsonb); res := res || 'FAIL demo inserted a template into the other office' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS demo cannot insert a template into the other office: ' || sqlerrm || E'\n'; end;
  begin insert into templates (office_id, name, category, body, storage_path) values (demo_office, 'مسار غريب', 'memo', '{"version":1,"blocks":[]}'::jsonb, other_office::text || '/templates/t1/x.docx'); res := res || 'FAIL a template with a path in the other office''s folder was accepted' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS a template with a storage path outside its own office folder is refused: ' || sqlerrm || E'\n'; end;
  begin update templates set office_id = null where id = own_tpl; get diagnostics n = row_count;
    res := res || format('%s demo cannot turn its template into a base template (%s rows)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  exception when others then res := res || 'PASS demo cannot turn its template into a base template: ' || sqlerrm || E'\n'; end;
  update templates set name = 'صيغة مكتب الاختبار (معدلة)' where id = own_tpl; get diagnostics n = row_count;
  res := res || format('%s demo updates its own template (%s row)', case when n = 1 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 1 then fails := fails + 1; end if;
  begin insert into templates (office_id, name, category, body) values (demo_office, 'x', 'memo', '{"version":1,"blocks":[]}'::jsonb); res := res || 'FAIL a one-letter name was accepted' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS a one-letter template name is refused: ' || sqlerrm || E'\n'; end;
  begin insert into templates (office_id, name, category, body) values (demo_office, 'جسم غير صالح', 'memo', '{"version":1}'::jsonb); res := res || 'FAIL a body with no blocks was accepted' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS a body with no blocks is refused: ' || sqlerrm || E'\n'; end;

  -- drafts
  insert into drafts (case_id, template_id, template_name, title, body, fill, needs_lawyer_review) values (demo_case, base_id, 'صيغة أساسية', 'مسودة اختبار', '{"version":1,"blocks":[]}'::jsonb, '{"filled":[],"missing":[],"lawyer":[]}'::jsonb, true) returning id into draft_id;
  res := res || 'PASS demo inserts a draft on its own case from a BASE template (office_id filled by default)' || E'\n';
  insert into drafts (case_id, template_id, template_name, title, body, fill) values (demo_case, own_tpl, 'صيغة المكتب', 'مسودة من صيغة المكتب', '{"version":1,"blocks":[]}'::jsonb, '{}'::jsonb) returning id into draft2_id;
  res := res || 'PASS demo inserts a draft from its own template' || E'\n';
  insert into drafts (case_id, template_name, title, body, fill) values (demo_case, 'صيغة محذوفة', 'مسودة بلا صيغة', '{"version":1,"blocks":[]}'::jsonb, '{}'::jsonb);
  res := res || 'PASS a draft with no template (template_id null) is accepted' || E'\n';
  select count(*) into n from drafts; res := res || format('%s demo sees %s drafts (expect 3)', case when n = 3 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 3 then fails := fails + 1; end if;
  begin insert into drafts (case_id, template_name, title, body, fill) values (other_case, 'x', 'مسودة على دعوى مكتب آخر', '{"version":1,"blocks":[]}'::jsonb, '{}'::jsonb); res := res || 'FAIL demo made a draft on the other office''s case' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS demo cannot make a draft on the other office''s case: ' || sqlerrm || E'\n'; end;
  begin insert into drafts (office_id, case_id, template_name, title, body, fill) values (other_office, other_case, 'x', 'مسودة في مكتب آخر', '{"version":1,"blocks":[]}'::jsonb, '{}'::jsonb); res := res || 'FAIL demo inserted a draft into the other office' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS demo cannot insert a draft with office_id = other: ' || sqlerrm || E'\n'; end;
  begin insert into drafts (case_id, template_id, template_name, title, body, fill) values (demo_case, other_tpl, 'x', 'مسودة بصيغة مكتب آخر', '{"version":1,"blocks":[]}'::jsonb, '{}'::jsonb); res := res || 'FAIL demo made a draft from the other office''s template' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS demo cannot make a draft from the other office''s template: ' || sqlerrm || E'\n'; end;
  begin insert into drafts (case_id, template_name, title, body, fill) values (demo_case, 'x', 'ا', '{"version":1,"blocks":[]}'::jsonb, '{}'::jsonb); res := res || 'FAIL a one-letter title was accepted' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS a one-letter draft title is refused: ' || sqlerrm || E'\n'; end;
  begin delete from cases where id = demo_case; res := res || 'FAIL a case with drafts was deleted' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS a case that has drafts cannot be deleted (on delete restrict): ' || sqlerrm || E'\n'; end;
  update drafts set title = 'مسودة اختبار (معدلة)' where id = draft_id; get diagnostics n = row_count;
  res := res || format('%s demo updates its own draft (%s row)', case when n = 1 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 1 then fails := fails + 1; end if;
  select count(*) into n from drafts where template_id = base_id; res := res || format('%s the use count of a base template for this office is its own drafts only (%s)', case when n = 1 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 1 then fails := fails + 1; end if;

  -- office style: one row per office
  insert into office_style (file_name, storage_path, style) values ('ورق.docx', demo_office::text || '/office-style/s1/ورق.docx', '{"header":{"lines":["مكتب"]}}'::jsonb) returning id into style_id;
  res := res || 'PASS demo saves its office style (office_id filled by default)' || E'\n';
  begin insert into office_style (file_name, storage_path, style) values ('ثاني.docx', demo_office::text || '/office-style/s2/x.docx', '{}'::jsonb); res := res || 'FAIL a second office style row was accepted' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS a second office style for the same office is refused (one per office): ' || sqlerrm || E'\n'; end;
  begin insert into office_style (office_id, file_name, storage_path, style) values (other_office, 'x.docx', other_office::text || '/office-style/s3/x.docx', '{}'::jsonb); res := res || 'FAIL demo saved a style into the other office' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS demo cannot save a style into the other office: ' || sqlerrm || E'\n'; end;
  update office_style set file_name = 'ورق جديد.docx', style = '{"header":{"lines":["مكتب جديد"]}}'::jsonb where id = style_id; get diagnostics n = row_count;
  res := res || format('%s demo replaces its office style (%s row)', case when n = 1 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 1 then fails := fails + 1; end if;
  begin update office_style set storage_path = other_office::text || '/office-style/s4/x.docx' where id = style_id; res := res || 'FAIL a style path in the other office''s folder was accepted' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS a style path outside its own office folder is refused: ' || sqlerrm || E'\n'; end;

  -- the EXISTING storage policies cover the new paths (no policy was added for them)
  begin
    insert into storage.objects (bucket_id, name, owner, metadata) values ('documents', demo_office::text || '/office-style/s1/test.docx', demo_user, '{}'::jsonb);
    res := res || 'PASS demo can put a Word file under {its office}/office-style/… in the documents bucket (existing docs_insert)' || E'\n';
  exception when others then res := res || 'FAIL demo cannot put a file under its own office folder: ' || sqlerrm || E'\n'; fails := fails + 1; end;
  begin
    insert into storage.objects (bucket_id, name, owner, metadata) values ('documents', other_office::text || '/templates/t9/test.docx', demo_user, '{}'::jsonb);
    res := res || 'FAIL demo put a file into the other office''s folder' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS demo cannot put a file under the other office''s folder (existing docs_insert): ' || sqlerrm || E'\n'; end;
  select count(*) into n from storage.objects where bucket_id = 'documents' and name like demo_office::text || '/office-style/%'; res := res || format('%s demo reads the file it just put (existing docs_select) (%s)', case when n = 1 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 1 then fails := fails + 1; end if;

  ---------------------------------------------------------------- the OTHER office user
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', other_user, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n from templates where office_id is null; res := res || format('%s other reads all %s base templates too', case when n = base_n then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> base_n then fails := fails + 1; end if;
  select count(*) into n from templates where office_id is not null; res := res || format('%s other sees ONLY its own office template (%s; expect 1, not the demo''s)', case when n = 1 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 1 then fails := fails + 1; end if;
  select count(*) into n from templates where id = own_tpl; res := res || format('%s other cannot read the demo template by id (%s)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  select count(*) into n from drafts; res := res || format('%s other sees %s drafts (expect 0: the demo office has 3)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  select count(*) into n from drafts where id = draft_id; res := res || format('%s other cannot read the demo draft by id (%s)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  select count(*) into n from office_style; res := res || format('%s other sees %s office styles (expect 0)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  update drafts set title = 'x' where id = draft_id; get diagnostics n = row_count;
  res := res || format('%s other cannot update the demo draft (%s rows)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  delete from drafts where id = draft_id; get diagnostics n = row_count;
  res := res || format('%s other cannot delete the demo draft (%s rows)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  update templates set name = 'x-hack' where id = own_tpl; get diagnostics n = row_count;
  res := res || format('%s other cannot update the demo template (%s rows)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  delete from templates where id = own_tpl; get diagnostics n = row_count;
  res := res || format('%s other cannot delete the demo template (%s rows)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  update office_style set file_name = 'x' where id = style_id; get diagnostics n = row_count;
  res := res || format('%s other cannot update the demo office style (%s rows)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  delete from office_style where id = style_id; get diagnostics n = row_count;
  res := res || format('%s other cannot delete the demo office style (%s rows)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  update templates set name = 'غيّرتها' where id = base_id; get diagnostics n = row_count;
  res := res || format('%s other cannot update a base template (%s rows)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  begin insert into drafts (case_id, template_name, title, body, fill) values (demo_case, 'x', 'مسودة على دعوى المكتب التجريبي', '{"version":1,"blocks":[]}'::jsonb, '{}'::jsonb); res := res || 'FAIL other made a draft on a demo case' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS other cannot make a draft on a demo case: ' || sqlerrm || E'\n'; end;
  begin insert into drafts (case_id, template_id, template_name, title, body, fill) values (other_case, own_tpl, 'x', 'مسودة بصيغة المكتب التجريبي', '{"version":1,"blocks":[]}'::jsonb, '{}'::jsonb); res := res || 'FAIL other made a draft from a demo template' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS other cannot make a draft from a demo template: ' || sqlerrm || E'\n'; end;
  begin insert into storage.objects (bucket_id, name, owner, metadata) values ('documents', demo_office::text || '/office-style/s1/hack.docx', other_user, '{}'::jsonb); res := res || 'FAIL other put a file into the demo office folder' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS other cannot put a file under the demo office folder (existing docs_insert): ' || sqlerrm || E'\n'; end;
  select count(*) into n from storage.objects where bucket_id = 'documents' and name like demo_office::text || '/%'; res := res || format('%s other cannot read the demo office''s files (%s)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  -- controls: the other office can do its own
  insert into drafts (case_id, template_id, template_name, title, body, fill) values (other_case, base_id, 'صيغة أساسية', 'مسودة المكتب الآخر', '{"version":1,"blocks":[]}'::jsonb, '{}'::jsonb) returning id into other_draft;
  res := res || 'PASS control: other makes a draft on its own case from a base template' || E'\n';
  select count(*) into n from drafts where template_id = base_id; res := res || format('%s control: the use count of the same base template for the other office is 1, not the demo''s (%s)', case when n = 1 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 1 then fails := fails + 1; end if;

  ---------------------------------------------------------------- back to the demo user
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', demo_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from drafts where id = other_draft; res := res || format('%s demo cannot read the other office''s draft (%s)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  select count(*) into n from drafts; res := res || format('%s demo still sees only its own %s drafts (expect 3)', case when n = 3 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 3 then fails := fails + 1; end if;
  delete from drafts where id = draft2_id; get diagnostics n = row_count;
  res := res || format('%s demo deletes its own draft (%s row)', case when n = 1 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 1 then fails := fails + 1; end if;
  delete from templates where id = own_tpl; get diagnostics n = row_count;
  res := res || format('%s demo deletes its own template (%s row; its drafts keep their name: template_id goes null)', case when n = 1 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 1 then fails := fails + 1; end if;
  select count(*) into n from drafts where id = draft2_id; if n <> 0 then fails := fails + 1; end if;

  ---------------------------------------------------------------- the policies ALONE (the link trigger switched off, as the table owner, inside this transaction)
  reset role;
  alter table drafts disable trigger drafts_check_links;
  perform set_config('request.jwt.claims', json_build_object('sub', demo_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into drafts (office_id, case_id, template_name, title, body, fill) values (other_office, other_case, 'x', 'مسودة سياسة فقط', '{"version":1,"blocks":[]}'::jsonb, '{}'::jsonb); res := res || 'FAIL (policy only) demo inserted a draft into the other office' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS (policy only) demo cannot insert a draft with office_id = other: ' || sqlerrm || E'\n'; end;
  begin update drafts set office_id = other_office where id = draft_id; get diagnostics n = row_count;
    res := res || format('%s (policy only) demo cannot move its draft into the other office (%s rows)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  exception when others then res := res || 'PASS (policy only) demo cannot move its draft into the other office: ' || sqlerrm || E'\n'; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', other_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into drafts (office_id, case_id, template_name, title, body, fill) values (demo_office, demo_case, 'x', 'مسودة سياسة فقط', '{"version":1,"blocks":[]}'::jsonb, '{}'::jsonb); res := res || 'FAIL (policy only) other inserted a draft into the demo office' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS (policy only) other cannot insert a draft with office_id = demo: ' || sqlerrm || E'\n'; end;

  reset role;
  raise exception E'RLS TEST RESULT (% failures). Rolled back, nothing persists:\n%', fails, res;
end $$;

rollback;
