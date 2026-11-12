-- Applied to ai-parlament-staging using Supabase migration:
-- 20261112013046_workspace_gmail_draft_queue_v1
-- Do not apply twice; existing staging migration history contains this version.
-- Gmail Drafts only. No sending action is allowed by this queue.
create table if not exists public.workspace_action_queue (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  workflow_instance_id uuid references public.workflow_instances(id) on delete set null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  work_control_task_id text,
  provider text not null check (provider = 'gmail'),
  action_kind text not null check (action_kind = 'gmail.draft'),
  idempotency_key text not null,
  draft_payload jsonb not null,
  payload_digest text not null,
  source_refs jsonb not null default '[]'::jsonb,
  validation_status text not null default 'not_tested'
    check (validation_status in ('not_tested','failed','passed')),
  review_status text not null default 'not_reviewed'
    check (review_status in ('not_reviewed','ready_for_review','approved','changes_requested')),
  status text not null default 'proposed'
    check (status in ('proposed','validated','executing','succeeded','failed','blocked')),
  provider_draft_id text,
  provider_thread_id text,
  provider_result jsonb not null default '{}'::jsonb,
  attempts integer not null default 0 check (attempts between 0 and 3),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, idempotency_key),
  check (jsonb_typeof(draft_payload) = 'object'),
  check (jsonb_typeof(source_refs) = 'array'),
  check (jsonb_typeof(provider_result) = 'object')
);
create index if not exists workspace_action_queue_project_idx
  on public.workspace_action_queue(project_id,created_at desc);
create index if not exists workspace_action_queue_pending_idx
  on public.workspace_action_queue(status,created_at)
  where status in ('proposed','validated','failed');
create table if not exists public.workspace_action_events (
  id bigint generated always as identity primary key,
  action_id uuid not null references public.workspace_action_queue(id) on delete cascade,
  event text not null,
  actor_user_id uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists workspace_action_events_action_idx
  on public.workspace_action_events(action_id,created_at);
alter table public.workspace_action_queue enable row level security;
alter table public.workspace_action_events enable row level security;
revoke all on public.workspace_action_queue from anon, authenticated;
revoke all on public.workspace_action_events from anon, authenticated;
grant select on public.workspace_action_queue to authenticated;
grant select on public.workspace_action_events to authenticated;
create policy workspace_action_queue_read_own
  on public.workspace_action_queue for select to authenticated
  using (
    owner_user_id = (select auth.uid())
    and exists (
      select 1 from public.organisation_members m
      where m.organisation_id = workspace_action_queue.organisation_id
        and m.user_id = (select auth.uid())
    )
  );
create policy workspace_action_events_read_own
  on public.workspace_action_events for select to authenticated
  using (
    exists (
      select 1 from public.workspace_action_queue a
      where a.id = workspace_action_events.action_id
        and a.owner_user_id = (select auth.uid())
    )
  );
comment on table public.workspace_action_queue is
 'Private workspace Gmail draft-only action queue linked to Parliament Core workflow instances. Signed-in users may read; writes require authorised Edge Function.';
