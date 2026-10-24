-- PR 7 (محرر المذكرة): the RLS test for draft_versions. ONE transaction, ROLLED BACK: nothing persists.
-- Run: scripts/sql.sh -f scripts/test-draft-versions-rls.sql
-- (Before the migration is applied, scripts/draft-editor-rls-rehearsal.sh runs the migration SQL inside the same transaction, then this test.)
--
-- The DO block ends with `raise exception 'RLS TEST RESULT ...'`, so the report comes back as the error text AND the transaction cannot commit,
-- even if the trailing rollback were lost. Each "must fail" case runs in its own sub-block (a failed statement would abort the transaction otherwise).
-- The rows it needs (a case and a draft in BOTH offices) are made here, as the table owner, inside the transaction.
begin;

do $$
declare
  demo_user uuid := '48157349-cf1e-4f3f-96de-cebaa1d56ed7';
  demo_office uuid := '3d6f1860-3a1c-4ee3-babb-21cb05e57a76';
  other_user uuid := '2331727a-8fb2-4095-ae00-f55b5431cc18';
  other_office uuid := 'a5fe61a0-36c7-42cc-b252-0503db8e61a8';
  demo_client uuid; demo_case uuid; other_client uuid; other_case uuid;
  demo_draft uuid; other_draft uuid; v1 uuid; v2 uuid; v3 uuid; other_v uuid;
  n int; res text := '';
  fails int := 0;
  body1 jsonb := '{"version":1,"blocks":[{"t":"p","text":"الأصل"}]}';
  body2 jsonb := '{"version":1,"blocks":[{"id":"b1","t":"p","text":"بعد التعديل","marks":[{"k":"b","s":0,"e":3}]}]}';
begin
  select c.client_id, c.id into demo_client, demo_case from cases c where c.office_id = demo_office and c.client_id is not null order by c.created_at limit 1;
  insert into clients (office_id, name) values (other_office, 'موكل المكتب الآخر (اختبار)') returning id into other_client;
  insert into cases (office_id, client_id, title) values (other_office, other_client, 'دعوى المكتب الآخر (اختبار)') returning id into other_case;
  insert into drafts (office_id, case_id, template_name, title, body, fill) values (demo_office, demo_case, 'x', 'مسودة اختبار للنسخ', body1, '{}'::jsonb) returning id into demo_draft;
  insert into drafts (office_id, case_id, template_name, title, body, fill) values (other_office, other_case, 'x', 'مسودة المكتب الآخر', body1, '{}'::jsonb) returning id into other_draft;
  res := res || format('setup: demo draft %s, other draft %s (made as the owner)', demo_draft, other_draft) || E'\n';

  ---------------------------------------------------------------- the DEMO office user
  perform set_config('request.jwt.claims', json_build_object('sub', demo_user, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into draft_versions (draft_id, body, kind) values (demo_draft, body1, 'original') returning id into v1;
  res := res || 'PASS demo inserts the original version of its own draft (office_id filled by default)' || E'\n';
  insert into draft_versions (draft_id, body, kind, note) values (demo_draft, body2, 'accept', 'صياغة') returning id into v2;
  res := res || 'PASS demo inserts an accept version with a note' || E'\n';
  insert into draft_versions (draft_id, body, kind, restored_from) values (demo_draft, body1, 'restore', v1) returning id into v3;
  res := res || 'PASS demo inserts a restore version that points at an older version of the SAME draft (a restore is a new row)' || E'\n';
  select count(*) into n from draft_versions where draft_id = demo_draft;
  res := res || format('%s demo reads its 3 versions (%s)', case when n = 3 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 3 then fails := fails + 1; end if;
  select count(*) into n from draft_versions where created_by = demo_user;
  res := res || format('%s created_by is filled with the signed-in user (%s of 3)', case when n = 3 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 3 then fails := fails + 1; end if;

  begin insert into draft_versions (draft_id, body, kind) values (demo_draft, body1, 'whatever'); res := res || 'FAIL an unknown kind was accepted' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS an unknown kind is refused: ' || sqlerrm || E'\n'; end;
  begin insert into draft_versions (draft_id, body, kind) values (demo_draft, '{"version":1}'::jsonb, 'save'); res := res || 'FAIL a body with no blocks was accepted' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS a body with no blocks is refused: ' || sqlerrm || E'\n'; end;
  begin insert into draft_versions (draft_id, body, kind, note) values (demo_draft, body1, 'save', repeat('x', 301)); res := res || 'FAIL a 301-character note was accepted' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS a note over 300 characters is refused: ' || sqlerrm || E'\n'; end;
  begin insert into draft_versions (draft_id, body, kind) values (other_draft, body1, 'save'); res := res || 'FAIL demo made a version of the other office''s draft' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS demo cannot make a version of the other office''s draft: ' || sqlerrm || E'\n'; end;
  begin insert into draft_versions (office_id, draft_id, body, kind) values (other_office, other_draft, body1, 'save'); res := res || 'FAIL demo inserted a version into the other office' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS demo cannot insert a version with office_id = other: ' || sqlerrm || E'\n'; end;
  begin insert into draft_versions (office_id, draft_id, body, kind) values (other_office, demo_draft, body1, 'save'); res := res || 'FAIL demo put its draft''s version under the other office' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS demo cannot file a version of its draft under the other office: ' || sqlerrm || E'\n'; end;
  update draft_versions set body = body2 where id = v1; get diagnostics n = row_count;
  res := res || format('%s versions are immutable: demo cannot update one (%s rows)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  select count(*) into n from draft_versions where id = v1 and body = body1;
  res := res || format('%s …and the old version is unchanged (%s)', case when n = 1 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 1 then fails := fails + 1; end if;

  ---------------------------------------------------------------- the OTHER office user
  reset role;
  insert into draft_versions (office_id, draft_id, body, kind) values (other_office, other_draft, body1, 'original') returning id into other_v; -- as the owner
  perform set_config('request.jwt.claims', json_build_object('sub', other_user, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n from draft_versions;
  res := res || format('%s other sees %s versions (expect 1: its own; the demo office has 3)', case when n = 1 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 1 then fails := fails + 1; end if;
  select count(*) into n from draft_versions where id = v1;
  res := res || format('%s other cannot read a demo version by id (%s)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  delete from draft_versions where id = v2; get diagnostics n = row_count;
  res := res || format('%s other cannot delete a demo version (%s rows)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  begin insert into draft_versions (draft_id, body, kind) values (demo_draft, body1, 'save'); res := res || 'FAIL other made a version of a demo draft' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS other cannot make a version of a demo draft: ' || sqlerrm || E'\n'; end;
  begin insert into draft_versions (draft_id, body, kind, restored_from) values (other_draft, body1, 'restore', v1); res := res || 'FAIL other restored from a demo version' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS other cannot point restored_from at a demo version: ' || sqlerrm || E'\n'; end;
  insert into draft_versions (draft_id, body, kind) values (other_draft, body2, 'save');
  res := res || 'PASS control: other saves a version of its own draft' || E'\n';

  ---------------------------------------------------------------- back to demo: restored_from must be a version of the SAME draft; delete; cascade
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', demo_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into draft_versions (draft_id, body, kind, restored_from) values (demo_draft, body1, 'restore', other_v); res := res || 'FAIL a restore pointing at another draft''s version was accepted' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS restored_from must be a version of the same draft: ' || sqlerrm || E'\n'; end;
  delete from draft_versions where id = v3; get diagnostics n = row_count;
  res := res || format('%s demo deletes a version of its own draft (a save that failed half way removes the row it made) (%s row)', case when n = 1 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 1 then fails := fails + 1; end if;
  delete from drafts where id = demo_draft; get diagnostics n = row_count;
  res := res || format('%s demo deletes its draft (%s row)', case when n = 1 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 1 then fails := fails + 1; end if;
  select count(*) into n from draft_versions where draft_id = demo_draft;
  res := res || format('%s the draft''s versions went with it (on delete cascade) (%s left)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;

  ---------------------------------------------------------------- the policies ALONE (the link trigger switched off, as the table owner, inside this transaction)
  reset role;
  alter table draft_versions disable trigger draft_versions_check_links;
  perform set_config('request.jwt.claims', json_build_object('sub', demo_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into draft_versions (office_id, draft_id, body, kind) values (other_office, other_draft, body1, 'save'); res := res || 'FAIL (policy only) demo inserted a version into the other office' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS (policy only) demo cannot insert a version with office_id = other: ' || sqlerrm || E'\n'; end;
  select count(*) into n from draft_versions;
  res := res || format('%s (policy only) demo sees 0 versions now (its draft is gone; the other office''s are hidden) (%s)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', other_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into draft_versions (office_id, draft_id, body, kind) values (demo_office, other_draft, body1, 'save'); res := res || 'FAIL (policy only) other filed a version under the demo office' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS (policy only) other cannot insert a version with office_id = demo: ' || sqlerrm || E'\n'; end;

  reset role;
  raise exception E'RLS TEST RESULT (% failures). Rolled back, nothing persists:\n%', fails, res;
end $$;

rollback;
