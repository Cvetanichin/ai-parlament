-- Database Schema spec §3. APPLIED to staging and production 12 July 2026.

alter table public.ai_agents add column allowed_tools text[] not null default '{}';

alter table public.prompt_modules add column model_provider text not null default 'anthropic';
alter table public.prompt_modules add column model_name text not null default 'claude-sonnet-4-6';
alter table public.prompt_modules add column status text not null default 'active'
  check (status in ('active','deprecated'));

alter table public.agent_runs add column prompt_module_id uuid references public.prompt_modules(id);
alter table public.agent_runs add column token_cost numeric;
alter table public.agent_runs add column latency_ms int;

create table public.workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version int not null,
  states jsonb not null,
  transitions jsonb not null,
  vote_of_no_confidence_threshold int not null default 2,
  gates jsonb not null,
  unique (name, version)
);
alter table public.workflow_definitions enable row level security;
create policy "workflow_definitions_select" on public.workflow_definitions
  for select to authenticated using (true);

create table public.workflow_instances (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  workflow_definition_id uuid not null references public.workflow_definitions(id),
  target_type text not null,
  target_id uuid not null,
  state text not null,
  vote_of_no_confidence_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.workflow_instances enable row level security;
create policy "workflow_instances_select" on public.workflow_instances for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "workflow_instances_insert" on public.workflow_instances for insert
  to authenticated with check (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "workflow_instances_update" on public.workflow_instances for update
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));

create table public.workflow_instance_history (   -- append-only
  id uuid primary key default gen_random_uuid(),
  workflow_instance_id uuid not null references public.workflow_instances(id),
  state text not null,
  entered_at timestamptz not null default now(),
  reason text
);
alter table public.workflow_instance_history enable row level security;
create policy "workflow_instance_history_select" on public.workflow_instance_history for select
  to authenticated using (workflow_instance_id in (
    select id from public.workflow_instances where organisation_id in (
      select organisation_id from public.organisation_members where user_id = (select auth.uid()))));
create policy "workflow_instance_history_insert" on public.workflow_instance_history for insert
  to authenticated with check (workflow_instance_id in (
    select id from public.workflow_instances where organisation_id in (
      select organisation_id from public.organisation_members where user_id = (select auth.uid()))));

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  workflow_instance_id uuid not null references public.workflow_instances(id),
  ministry text not null,
  depends_on uuid[] default '{}',
  status text not null check (status in ('pending','running','succeeded','failed')),
  agent_run_id uuid references public.agent_runs(id),
  retry_count int not null default 0
);
alter table public.tasks enable row level security;
create policy "tasks_select" on public.tasks for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "tasks_insert" on public.tasks for insert
  to authenticated with check (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "tasks_update" on public.tasks for update
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
