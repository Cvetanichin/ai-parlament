-- Personal Workspace sync (apps/personal-workspace, docs/SYNC.md).
--
-- A single-user, local-first app syncs its records across devices through
-- one row per record. Each user can only ever see and change their own rows
-- (RLS keyed on auth.uid()); no organisation_id, because this data is
-- personal and deliberately outside the multi-tenant Parliament model.
--
-- Conflict handling is last-write-wins per record, decided by the client's
-- own edit timestamp (client_updated_at, epoch ms). Deletes are tombstones
-- (deleted = true, data cleared) so offline devices learn about them.
-- server_updated_at is set by the database on every write and is the pull
-- cursor; it is never trusted from the client.
--
-- Additive and self-contained: creates one table, one trigger function and
-- one RPC. Touches nothing that exists. Rollback:
--   drop function public.workspace_push(jsonb);
--   drop table public.workspace_items;
--   drop function public.workspace_items_before_write();

create table public.workspace_items (
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  kind text not null
    check (kind in ('task', 'project', 'doc', 'event', 'run', 'agent', 'settings')),
  id text not null
    check (id ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  data jsonb not null default '{}'::jsonb
    check (octet_length(data::text) <= 2097152),
  deleted boolean not null default false,
  client_updated_at bigint not null check (client_updated_at > 0),
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, kind, id)
);

comment on table public.workspace_items is
  'Personal Workspace sync: one row per record per user. Last-write-wins on client_updated_at; deletes are tombstones. See docs/SYNC.md.';

create index workspace_items_user_server_updated_idx
  on public.workspace_items (user_id, server_updated_at);

-- Database-owned write metadata: the pull cursor cannot be spoofed, and a row
-- can never be reassigned to another user.
create function public.workspace_items_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at := clock_timestamp();
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

create trigger workspace_items_before_write
  before insert or update on public.workspace_items
  for each row execute function public.workspace_items_before_write();

alter table public.workspace_items enable row level security;

create policy "workspace_items_select" on public.workspace_items for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "workspace_items_insert" on public.workspace_items for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "workspace_items_update" on public.workspace_items for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Needed for the in-app "delete my cloud data" action.
create policy "workspace_items_delete" on public.workspace_items for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Migration 21 granted table privileges to anon by default; RLS already
-- denies anon (no policy), but personal data gets no anon privilege at all.
revoke all on public.workspace_items from public, anon;
grant select, insert, update, delete on public.workspace_items to authenticated;

-- Batched upsert with a last-write-wins guard. SECURITY INVOKER: RLS applies,
-- so a caller can only ever write their own rows. A row is only replaced when
-- the incoming client_updated_at is >= the stored one, so a stale device that
-- reconnects cannot overwrite newer work. Returns the number of rows written.
create function public.workspace_push(items jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  written integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if jsonb_typeof(items) is distinct from 'array' then
    raise exception 'items must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(items) > 500 then
    raise exception 'at most 500 items per call' using errcode = '22023';
  end if;
  if (select count(*) from public.workspace_items) + jsonb_array_length(items) > 50000 then
    raise exception 'workspace item limit reached' using errcode = '54000';
  end if;

  insert into public.workspace_items as w (kind, id, data, deleted, client_updated_at)
  select i.kind, i.id,
         case when coalesce(i.deleted, false) then '{}'::jsonb else coalesce(i.data, '{}'::jsonb) end,
         coalesce(i.deleted, false),
         i.client_updated_at
  from (
    -- one row per (kind, id) per call: the newest wins, so a duplicate in the
    -- batch cannot make ON CONFLICT touch the same row twice.
    select distinct on (r.kind, r.id) r.*
    from jsonb_to_recordset(items)
         as r (kind text, id text, data jsonb, deleted boolean, client_updated_at bigint)
    order by r.kind, r.id, r.client_updated_at desc
  ) i
  on conflict (user_id, kind, id) do update
    set data = excluded.data,
        deleted = excluded.deleted,
        client_updated_at = excluded.client_updated_at
    where excluded.client_updated_at >= w.client_updated_at;

  get diagnostics written = row_count;
  return written;
end;
$$;

revoke execute on function public.workspace_push(jsonb) from public, anon;
grant execute on function public.workspace_push(jsonb) to authenticated;
