-- Personal Workspace sync contract (migration 26).
-- Run after local migrations:
--   psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/personal_workspace_sync.sql
-- Everything runs in one transaction that is rolled back. No production data.
begin;

-- Two throwaway users. (On a full Supabase stack the on_auth_user_created
-- trigger also adds their profiles rows; the rollback removes those too.)
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b2');

-- Acting as a signed-in user = authenticated role + the JWT claims PostgREST sets.
create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end;
$$;

do $$
declare
  a constant uuid := '00000000-0000-0000-0000-0000000000a1';
  b constant uuid := '00000000-0000-0000-0000-0000000000b2';
  n integer;
  seen text;
  t0 timestamptz;
  t1 timestamptz;
begin
  -- 1. Privilege surface: anon has nothing; authenticated can use the RPC.
  if has_table_privilege('anon', 'public.workspace_items', 'SELECT')
     or has_function_privilege('anon', 'public.workspace_push(jsonb)', 'EXECUTE')
  then
    raise exception 'anon can reach workspace sync';
  end if;
  if not has_function_privilege('authenticated', 'public.workspace_push(jsonb)', 'EXECUTE') then
    raise exception 'authenticated cannot call workspace_push';
  end if;

  -- 2. User A writes three records; a duplicate in the batch is collapsed.
  perform pg_temp.act_as(a);
  n := public.workspace_push('[
    {"kind":"task","id":"t1","data":{"title":"old"},"deleted":false,"client_updated_at":1000},
    {"kind":"task","id":"t1","data":{"title":"dup-newer"},"deleted":false,"client_updated_at":1500},
    {"kind":"doc","id":"d1","data":{"title":"Doc"},"deleted":false,"client_updated_at":1000},
    {"kind":"project","id":"p1","data":{"name":"P"},"deleted":false,"client_updated_at":1000}
  ]'::jsonb);
  if n <> 3 then raise exception 'expected 3 rows written, got %', n; end if;
  select data ->> 'title' into seen from public.workspace_items where id = 't1';
  if seen <> 'dup-newer' then raise exception 'batch duplicate not resolved to newest: %', seen; end if;

  -- 3. Last-write-wins: a stale write is ignored, a newer one replaces.
  n := public.workspace_push('[{"kind":"task","id":"t1","data":{"title":"stale"},"deleted":false,"client_updated_at":1200}]'::jsonb);
  if n <> 0 then raise exception 'stale write was applied'; end if;
  n := public.workspace_push('[{"kind":"task","id":"t1","data":{"title":"newer"},"deleted":false,"client_updated_at":2000}]'::jsonb);
  if n <> 1 then raise exception 'newer write was not applied'; end if;
  select data ->> 'title' into seen from public.workspace_items where id = 't1';
  if seen <> 'newer' then raise exception 'unexpected title %', seen; end if;

  -- 4. Tombstone clears the content but keeps the row for other devices.
  n := public.workspace_push('[{"kind":"doc","id":"d1","data":{"title":"secret"},"deleted":true,"client_updated_at":3000}]'::jsonb);
  if not exists (select 1 from public.workspace_items where id = 'd1' and deleted and data = '{}'::jsonb) then
    raise exception 'tombstone did not clear data';
  end if;

  -- 5. server_updated_at is database-owned and moves forward on update.
  select server_updated_at into t0 from public.workspace_items where id = 'p1';
  perform public.workspace_push('[{"kind":"project","id":"p1","data":{"name":"P2"},"deleted":false,"client_updated_at":4000}]'::jsonb);
  select server_updated_at into t1 from public.workspace_items where id = 'p1';
  if t1 <= t0 then raise exception 'server_updated_at did not advance'; end if;

  -- 6. Input validation: bad kind, bad id, non-array, oversized batch.
  begin
    perform public.workspace_push('[{"kind":"bogus","id":"x","data":{},"deleted":false,"client_updated_at":1}]'::jsonb);
    raise exception 'bad kind accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.workspace_push('[{"kind":"task","id":"has space","data":{},"deleted":false,"client_updated_at":1}]'::jsonb);
    raise exception 'bad id accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.workspace_push('{"not":"an array"}'::jsonb);
    raise exception 'non-array accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.workspace_push((select jsonb_agg(jsonb_build_object('kind','task','id','b'||g,'data','{}'::jsonb,'deleted',false,'client_updated_at',1)) from generate_series(1, 501) g));
    raise exception '501-item batch accepted';
  exception when invalid_parameter_value then null;
  end;

  -- 7. Isolation: user B sees none of A's rows, cannot touch them, and their
  --    own record with the same kind and id is a separate row.
  perform pg_temp.act_as(b);
  select count(*) into n from public.workspace_items;
  if n <> 0 then raise exception 'user B can read % of user A rows', n; end if;
  update public.workspace_items set data = '{"hijack":true}';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'user B updated user A rows'; end if;
  delete from public.workspace_items;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'user B deleted user A rows'; end if;
  begin
    insert into public.workspace_items (user_id, kind, id, client_updated_at)
      values (a, 'task', 'forged', 1);
    raise exception 'user B inserted a row owned by user A';
  exception when insufficient_privilege then null;
  end;
  perform public.workspace_push('[{"kind":"task","id":"t1","data":{"title":"B own"},"deleted":false,"client_updated_at":1}]'::jsonb);
  select count(*) into n from public.workspace_items;
  if n <> 1 then raise exception 'user B should see exactly their own row, saw %', n; end if;

  -- 8. Delete-my-data only removes the caller's rows.
  delete from public.workspace_items;
  perform pg_temp.act_as(a);
  select count(*) into n from public.workspace_items;
  if n <> 3 then raise exception 'user A rows changed by user B delete: %', n; end if;

  -- 9. Unauthenticated calls to the RPC are refused.
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role authenticated';
  begin
    perform public.workspace_push('[]'::jsonb);
    raise exception 'RPC accepted a call with no user';
  exception when invalid_authorization_specification then null;
  end;

  reset role;
  raise notice 'personal_workspace_sync: all assertions passed';
end;
$$;

rollback;
