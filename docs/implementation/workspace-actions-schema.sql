-- DRAFT schema for integration review. Convert to a CLI-created migration after schema review.
-- Dedicated action queue. No competing workflows/projects/users.
create table if not exists public.workspace_external_actions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  project_id uuid not null,
  requested_by uuid not null references auth.users(id),
  task_external_id text,
  service text not null check (service in ('google_drive','gmail','google_calendar','github','portal')),
  operation text not null,
  resource_locator text not null,
  payload jsonb not null default '{}'::jsonb,
  payload_sha256 text not null,
  artifact_version text,
  idempotency_key text not null,
  risk_level text not null default 'normal' check (risk_level in ('normal','high')),
  status text not null default 'proposed' check (status in ('proposed','awaiting_approval','approved','executing','succeeded','failed','blocked','cancelled')),
  approval_required boolean not null default true,
  approval_actor uuid references auth.users(id),
  approval_at timestamptz,
  approval_payload_sha256 text,
  execution_ref text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint action_approval_binding check (
    (approval_actor is null and approval_at is null and approval_payload_sha256 is null)
    or (approval_actor is not null and approval_at is not null and approval_payload_sha256 is not null)
  ),
  unique (requested_by, idempotency_key)
);
create index if not exists workspace_external_actions_project_idx
  on public.workspace_external_actions(project_id, created_at desc);
create table if not exists public.workspace_action_events (
  id bigint generated always as identity primary key,
  action_id uuid not null references public.workspace_external_actions(id) on delete restrict,
  actor_id uuid references auth.users(id),
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists workspace_action_events_action_idx
  on public.workspace_action_events(action_id, created_at);
alter table public.workspace_external_actions enable row level security;
alter table public.workspace_action_events enable row level security;
-- Deliberately no direct anon/authenticated write policy: all writes run
-- through authenticated, project-authorised server endpoints.
revoke all on public.workspace_external_actions from anon, authenticated;
revoke all on public.workspace_action_events from anon, authenticated;
-- The gateway must authorise access using existing project/organisation membership
-- before using a privileged client and must not expose the service key.
-- Restrict event details to references and safe metadata, not email bodies or secrets.
