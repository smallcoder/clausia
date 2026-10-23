-- PR 5 (الحسابات): the RLS test for case_fees and account_movements. ONE transaction, ROLLED BACK: nothing persists.
-- Run: scripts/sql.sh -f scripts/test-accounts-rls.sql
-- (Before the migration is applied, scripts/accounts-rls-rehearsal.sh runs the migration SQL inside the same transaction, then this test.)
--
--   begin;
--   do $$ ... set local role authenticated; set_config('request.jwt.claims', {sub: <user>}, true); ... $$;   -- it ends with RAISE, so the transaction is aborted
--   rollback;
--
-- The DO block ends with `raise exception 'RLS TEST RESULT ...'`, so the report comes back as the error text AND the transaction cannot commit,
-- even if the trailing rollback were lost. Each "must fail" case runs in its own sub-block (a failed statement would abort the transaction otherwise).
-- The rows it needs from the OTHER office (a client and a case: that office has none) are made here, as the table owner, inside the transaction.
begin;

do $$
declare
  demo_user uuid := '48157349-cf1e-4f3f-96de-cebaa1d56ed7';
  demo_office uuid := '3d6f1860-3a1c-4ee3-babb-21cb05e57a76';
  other_user uuid := '2331727a-8fb2-4095-ae00-f55b5431cc18';
  other_office uuid := 'a5fe61a0-36c7-42cc-b252-0503db8e61a8';
  demo_client uuid; demo_case uuid; demo_case2 uuid;
  other_client uuid; other_case uuid;
  fee_id uuid; del_client uuid; mv_id uuid; mv2_id uuid; other_mv uuid;
  n int; res text := '';
  fails int := 0;
begin
  -- the demo office's own rows (read only here) and the other office's rows (made in this transaction)
  select c.client_id, c.id into demo_client, demo_case from cases c where c.office_id = demo_office and c.client_id is not null order by c.created_at limit 1;
  select c.id into demo_case2 from cases c where c.office_id = demo_office and c.client_id is not null and c.client_id <> demo_client order by c.created_at limit 1;
  insert into clients (office_id, name) values (other_office, 'موكل المكتب الآخر (اختبار)') returning id into other_client;
  insert into cases (office_id, client_id, title) values (other_office, other_client, 'دعوى المكتب الآخر (اختبار)') returning id into other_case;
  res := res || format('setup: demo client %s, demo case %s (a case of ANOTHER demo client: %s), other client %s, other case %s', demo_client, demo_case, demo_case2, other_client, other_case) || E'\n';

  ---------------------------------------------------------------- the DEMO office user
  perform set_config('request.jwt.claims', json_build_object('sub', demo_user, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into case_fees (case_id, kind, amount_piasters) values (demo_case, 'fixed', 1500000) returning id into fee_id;
  res := res || 'PASS demo inserts a fixed fee of its own case (office_id filled by default)' || E'\n';
  insert into account_movements (client_id, case_id, kind, amount_piasters, method, moved_on) values (demo_client, demo_case, 'receipt', 300000, 'vodafone_cash', '2026-10-23') returning id into mv_id;
  res := res || 'PASS demo inserts a receipt on its own client + case' || E'\n';
  insert into account_movements (client_id, kind, amount_piasters, method, moved_on, charged_to, note) values (demo_client, 'expense', 45050, 'cash', '2026-10-22', 'office', 'رسوم') returning id into mv2_id;
  res := res || 'PASS demo inserts an expense charged to the office on the general account (case_id null), 450.50 EGP = 45050 piasters' || E'\n';
  select count(*) into n from account_movements; res := res || format('%s demo sees %s movements (expect 2)', case when n = 2 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 2 then fails := fails + 1; end if;
  select count(*) into n from case_fees; res := res || format('%s demo sees %s fees (expect 1)', case when n = 1 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 1 then fails := fails + 1; end if;
  update account_movements set note = 'ملاحظة' where id = mv_id; get diagnostics n = row_count;
  res := res || format('%s demo updates its own movement (%s row)', case when n = 1 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 1 then fails := fails + 1; end if;

  -- table checks: each must be refused
  begin insert into account_movements (client_id, kind, amount_piasters, method, moved_on, charged_to) values (demo_client, 'receipt', 100, 'cash', '2026-10-23', 'client'); res := res || 'FAIL a receipt with charged_to was accepted' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS a receipt with charged_to is refused: ' || sqlerrm || E'\n'; end;
  begin insert into account_movements (client_id, kind, amount_piasters, method, moved_on) values (demo_client, 'expense', 100, 'cash', '2026-10-23'); res := res || 'FAIL an expense without charged_to was accepted' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS an expense without charged_to is refused: ' || sqlerrm || E'\n'; end;
  begin insert into account_movements (client_id, kind, amount_piasters, method, moved_on) values (demo_client, 'receipt', 0, 'cash', '2026-10-23'); res := res || 'FAIL a zero amount was accepted' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS a zero amount is refused: ' || sqlerrm || E'\n'; end;
  begin insert into account_movements (client_id, kind, amount_piasters, method, moved_on) values (demo_client, 'receipt', -5, 'cash', '2026-10-23'); res := res || 'FAIL a negative amount was accepted' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS a negative amount is refused: ' || sqlerrm || E'\n'; end;
  begin insert into case_fees (case_id, kind, amount_piasters) values (demo_case, 'fixed', 100); res := res || 'FAIL a second fee for the same case was accepted' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS a second fee for the same case is refused: ' || sqlerrm || E'\n'; end;
  if demo_case2 is not null then
    begin insert into case_fees (case_id, kind, amount_piasters) values (demo_case2, 'open', 100); res := res || 'FAIL an open fee with an amount was accepted' || E'\n'; fails := fails + 1;
    exception when others then res := res || 'PASS an open fee with an amount is refused: ' || sqlerrm || E'\n'; end;
    begin insert into case_fees (case_id, kind) values (demo_case2, 'fixed'); res := res || 'FAIL a fixed fee without an amount was accepted' || E'\n'; fails := fails + 1;
    exception when others then res := res || 'PASS a fixed fee without an amount is refused: ' || sqlerrm || E'\n'; end;
    begin insert into account_movements (client_id, case_id, kind, amount_piasters, method, moved_on) values (demo_client, demo_case2, 'receipt', 100, 'cash', '2026-10-23'); res := res || 'FAIL a case of another client was accepted' || E'\n'; fails := fails + 1;
    exception when others then res := res || 'PASS a case that belongs to another client is refused: ' || sqlerrm || E'\n'; end;
  end if;
  begin insert into account_movements (client_id, kind, amount_piasters, method, moved_on) values (demo_client, 'receipt', 100, 'barter', '2026-10-23'); res := res || 'FAIL an unknown method was accepted' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS an unknown method is refused: ' || sqlerrm || E'\n'; end;

  -- the other office's ids, used by the demo user
  begin insert into account_movements (client_id, kind, amount_piasters, method, moved_on) values (other_client, 'receipt', 100, 'cash', '2026-10-23'); res := res || 'FAIL demo inserted a movement for the other office''s client' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS demo cannot insert a movement for the other office''s client (own office_id): ' || sqlerrm || E'\n'; end;
  begin insert into account_movements (office_id, client_id, kind, amount_piasters, method, moved_on) values (other_office, other_client, 'receipt', 100, 'cash', '2026-10-23'); res := res || 'FAIL demo inserted a row into the other office' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS demo cannot insert a movement into the other office (office_id = other): ' || sqlerrm || E'\n'; end;
  begin insert into case_fees (case_id, kind, amount_piasters) values (other_case, 'fixed', 100); res := res || 'FAIL demo set a fee on the other office''s case' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS demo cannot set a fee on the other office''s case: ' || sqlerrm || E'\n'; end;
  begin insert into case_fees (office_id, case_id, kind, amount_piasters) values (other_office, other_case, 'fixed', 100); res := res || 'FAIL demo inserted a fee into the other office' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS demo cannot insert a fee into the other office (office_id = other): ' || sqlerrm || E'\n'; end;

  ---------------------------------------------------------------- the OTHER office user
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', other_user, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n from account_movements; res := res || format('%s other sees %s movements (expect 0: the demo office has 2)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  select count(*) into n from case_fees; res := res || format('%s other sees %s fees (expect 0: the demo office has 1)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  select count(*) into n from account_movements where id = mv_id; res := res || format('%s other cannot read the demo movement by id (%s rows)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  update account_movements set note = 'x' where id = mv_id; get diagnostics n = row_count;
  res := res || format('%s other cannot update the demo movement (%s rows)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  delete from account_movements where id = mv_id; get diagnostics n = row_count;
  res := res || format('%s other cannot delete the demo movement (%s rows)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  update case_fees set kind = 'open', amount_piasters = null where id = fee_id; get diagnostics n = row_count;
  res := res || format('%s other cannot update the demo fee (%s rows)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  delete from case_fees where id = fee_id; get diagnostics n = row_count;
  res := res || format('%s other cannot delete the demo fee (%s rows)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  begin insert into account_movements (client_id, kind, amount_piasters, method, moved_on) values (demo_client, 'receipt', 100, 'cash', '2026-10-23'); res := res || 'FAIL other inserted a movement for the demo office''s client' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS other cannot insert a movement for the demo office''s client (own office_id): ' || sqlerrm || E'\n'; end;
  begin insert into account_movements (office_id, client_id, kind, amount_piasters, method, moved_on) values (demo_office, demo_client, 'receipt', 100, 'cash', '2026-10-23'); res := res || 'FAIL other inserted a row into the demo office' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS other cannot insert a movement into the demo office (office_id = demo): ' || sqlerrm || E'\n'; end;
  begin insert into case_fees (case_id, kind, amount_piasters) values (demo_case2, 'fixed', 100); res := res || 'FAIL other set a fee on a demo case' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS other cannot set a fee on a demo case: ' || sqlerrm || E'\n'; end;
  insert into account_movements (client_id, case_id, kind, amount_piasters, method, moved_on) values (other_client, other_case, 'receipt', 500, 'cheque', '2026-10-23') returning id into other_mv;
  res := res || 'PASS control: other inserts a receipt on its own client + case' || E'\n';
  select count(*) into n from account_movements; res := res || format('%s control: other sees its own %s movement', case when n = 1 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 1 then fails := fails + 1; end if;

  ---------------------------------------------------------------- back to the demo user: it cannot see the other office's row
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', demo_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from account_movements where id = other_mv; res := res || format('%s demo cannot read the other office''s movement (%s rows)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  select count(*) into n from account_movements; res := res || format('%s demo still sees only its own %s movements (expect 2)', case when n = 2 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 2 then fails := fails + 1; end if;
  delete from account_movements where id = mv2_id; get diagnostics n = row_count;
  res := res || format('%s demo deletes its own movement (%s row)', case when n = 1 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 1 then fails := fails + 1; end if;
  -- a client with NO case but with a movement cannot be deleted (on delete restrict); the same for a case with a movement
  insert into clients (name) values ('موكل اختبار الحذف') returning id into del_client;
  insert into account_movements (client_id, kind, amount_piasters, method, moved_on) values (del_client, 'receipt', 100, 'cash', '2026-10-23');
  begin delete from clients where id = del_client; res := res || 'FAIL a client with a movement was deleted' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS a client that has movements cannot be deleted (on delete restrict): ' || sqlerrm || E'\n'; end;
  begin delete from cases where id = demo_case; res := res || 'FAIL a case with a movement was deleted' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS a case that has movements cannot be deleted (on delete restrict): ' || sqlerrm || E'\n'; end;

  ---------------------------------------------------------------- the policies ALONE (the link triggers switched off, as the table owner, inside this transaction)
  -- the triggers above refuse first (a BEFORE trigger runs before the policy check), so here they are off to prove the four policies by themselves.
  reset role;
  alter table account_movements disable trigger account_movements_check_links;
  alter table case_fees disable trigger case_fees_check_links;
  perform set_config('request.jwt.claims', json_build_object('sub', demo_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into account_movements (office_id, client_id, kind, amount_piasters, method, moved_on) values (other_office, other_client, 'receipt', 100, 'cash', '2026-10-23'); res := res || 'FAIL (policy only) demo inserted a movement into the other office' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS (policy only) demo cannot insert a movement with office_id = other: ' || sqlerrm || E'\n'; end;
  begin insert into case_fees (office_id, case_id, kind, amount_piasters) values (other_office, other_case, 'fixed', 100); res := res || 'FAIL (policy only) demo inserted a fee into the other office' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS (policy only) demo cannot insert a fee with office_id = other: ' || sqlerrm || E'\n'; end;
  begin update account_movements set office_id = other_office where id = mv_id; get diagnostics n = row_count;
    res := res || format('%s (policy only) demo cannot move its movement into the other office (%s rows)', case when n = 0 then 'PASS' else 'FAIL' end, n) || E'\n'; if n <> 0 then fails := fails + 1; end if;
  exception when others then res := res || 'PASS (policy only) demo cannot move its movement into the other office: ' || sqlerrm || E'\n'; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', other_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into account_movements (office_id, client_id, kind, amount_piasters, method, moved_on) values (demo_office, demo_client, 'receipt', 100, 'cash', '2026-10-23'); res := res || 'FAIL (policy only) other inserted a movement into the demo office' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS (policy only) other cannot insert a movement with office_id = demo: ' || sqlerrm || E'\n'; end;
  begin insert into case_fees (office_id, case_id, kind, amount_piasters) values (demo_office, demo_case2, 'fixed', 100); res := res || 'FAIL (policy only) other inserted a fee into the demo office' || E'\n'; fails := fails + 1;
  exception when others then res := res || 'PASS (policy only) other cannot insert a fee with office_id = demo: ' || sqlerrm || E'\n'; end;

  reset role;
  raise exception E'RLS TEST RESULT (% failures). Rolled back, nothing persists:\n%', fails, res;
end $$;

rollback;
