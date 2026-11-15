-- Run against an isolated local stack after all committed migrations.
begin;
do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity) then
    raise exception 'Public table without RLS';
  end if;
  if has_function_privilege('anon','public.bootstrap_own_organisation()','execute') then
    raise exception 'Anonymous organisation bootstrap is exposed';
  end if;
  if not has_function_privilege('authenticated','public.bootstrap_own_organisation()','execute') then
    raise exception 'Authenticated organisation bootstrap unavailable';
  end if;
  if has_function_privilege('authenticated','public.apply_embedding_batch(text,text,timestamptz,jsonb)','execute')
    or has_function_privilege('authenticated','public.handle_new_user()','execute') then
    raise exception 'Internal definer function exposed to application users';
  end if;
  if has_table_privilege('anon','public.error_logs','select') then
    raise exception 'Application error logs exposed anonymously';
  end if;
  if has_table_privilege('authenticated','public.workspace_action_queue','insert') then
    raise exception 'Direct client action-queue writes exposed';
  end if;
  if to_regclass('public.workspace_items') is null
    or to_regprocedure('public.rpc_get_workflow_bundle(uuid)') is null then
    raise exception 'Committed sync/RPC migrations missing';
  end if;
end $$;

select set_config('test.user_a',gen_random_uuid()::text,true);
select set_config('test.user_b',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values
  (current_setting('test.user_a')::uuid,'staging-check-a@example.invalid','{}','{}'),
  (current_setting('test.user_b')::uuid,'staging-check-b@example.invalid','{}','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.user_a'),true);
do $$
declare first_org uuid; second_org uuid;
begin
  first_org := public.bootstrap_own_organisation();
  second_org := public.bootstrap_own_organisation();
  if first_org is null or first_org <> second_org then
    raise exception 'Organisation bootstrap is not idempotent';
  end if;
  if (select count(*) from public.organisation_members where user_id=auth.uid() and role='owner') <> 1 then
    raise exception 'Owner membership missing';
  end if;
  if (select count(*) from public.profiles where id=auth.uid()) <> 1 then
    raise exception 'Profile trigger failed';
  end if;
  insert into public.projects(id,name,created_by,organisation_id)
    values ('8c9e702e-418a-4863-a371-f4609312c1e4','Synthetic staging check',auth.uid(),first_org);
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.user_b'),true);
select public.bootstrap_own_organisation();
do $$
begin
  if exists(select 1 from public.projects where id='8c9e702e-418a-4863-a371-f4609312c1e4') then
    raise exception 'Cross-organisation project read allowed';
  end if;
end $$;
reset role;
rollback;
select 'PASS: migration replay, permissions, identity bootstrap and tenant isolation; fixtures rolled back' as result;
