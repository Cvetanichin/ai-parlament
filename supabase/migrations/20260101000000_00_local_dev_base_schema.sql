-- LOCAL DEV BOOTSTRAP ONLY -- not part of the numbered 01-16 sequence, not
-- applied to staging or production, and not described by any doc/ADR as a
-- real migration.
--
-- Every migration from 01 onward is additive against tables that already
-- exist for real in the live Intelligence Workspace Supabase project
-- (ADR-0007: "additive ALTER TABLE migrations against the real, live
-- Intelligence Workspace tables... not a fresh schema for a separate
-- instance"). Those base tables (projects, clients, activities, indicators,
-- risks, deliverables, project_documents, reports, ai_agents,
-- prompt_modules, agent_runs, profiles) were never created by any migration
-- in this repo, because they didn't need to be -- they already existed on
-- the real project before this migration sequence started. A brand-new
-- local Postgres instance (`supabase start` / `db reset`) has no such
-- history, so migration 01 fails immediately (`relation "public.projects"
-- does not exist`) without something to create them first.
--
-- Column shapes below are reconstructed from docs/08-Project-Operations/
-- Project-Operations-Specification-v1.0.md §1.1, which documents this exact
-- schema "confirmed by direct code inspection" of the real, live product --
-- not guessed. This file exists purely so `supabase start`/`db reset` work
-- on a laptop with no access to the real project; it is deliberately named
-- outside the 01-16 sequence and guarded below so it is a no-op if ever run
-- against an environment where these tables are real (staging/production).
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'projects') then
    raise notice 'local_dev_base_schema: public.projects already exists -- skipping, this file is local-dev-only';
    return;
  end if;

  create table public.clients (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    created_by uuid references auth.users(id),
    created_at timestamptz not null default now()
  );

  create table public.projects (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references public.clients(id),
    name text not null,
    domain text,
    status text,
    start_date date,
    end_date date,
    budget_total numeric,
    budget_spent numeric,
    donor text,
    grant_reference text,
    created_by uuid references auth.users(id),
    created_at timestamptz not null default now()
  );

  create table public.activities (
    id uuid primary key default gen_random_uuid(),
    project_id uuid references public.projects(id),
    title text not null,
    output text,
    start_date date,
    end_date date,
    status text,
    responsible text,
    created_at timestamptz not null default now()
  );

  create table public.indicators (
    id uuid primary key default gen_random_uuid(),
    project_id uuid references public.projects(id),
    level text,
    unit text,
    baseline numeric,
    target numeric,
    actual numeric,
    data_source text,
    collection_method text,
    frequency text,
    status text,
    created_at timestamptz not null default now()
  );

  create table public.risks (
    id uuid primary key default gen_random_uuid(),
    project_id uuid references public.projects(id),
    category text,
    likelihood text,
    impact text,
    risk_level text,
    mitigation text,
    owner text,
    status text,
    created_at timestamptz not null default now()
  );

  create table public.deliverables (
    id uuid primary key default gen_random_uuid(),
    project_id uuid references public.projects(id),
    activity_id uuid references public.activities(id),
    title text not null,
    description text,
    status text,
    created_at timestamptz not null default now()
  );

  create table public.project_documents (
    id uuid primary key default gen_random_uuid(),
    project_id uuid references public.projects(id),
    file_name text,
    storage_path text,
    uploaded_by uuid references auth.users(id),
    created_at timestamptz not null default now()
  );

  create table public.reports (
    id uuid primary key default gen_random_uuid(),
    project_id uuid references public.projects(id),
    title text,
    report_type text,
    content text,
    period_start date,
    period_end date,
    generated_by uuid references auth.users(id),
    created_at timestamptz not null default now()
  );

  create table public.ai_agents (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique,
    name text not null,
    edge_function text,
    description text,
    created_at timestamptz not null default now()
  );

  create table public.prompt_modules (
    id uuid primary key default gen_random_uuid(),
    agent_id uuid references public.ai_agents(id),
    name text,
    content text,
    version int not null default 1,
    created_at timestamptz not null default now()
  );

  create table public.agent_runs (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id),
    agent_id uuid references public.ai_agents(id),
    status text,
    input_data jsonb,
    output_data jsonb,
    report_id uuid references public.reports(id),
    triggered_by uuid references auth.users(id),
    error_message text,
    created_at timestamptz not null default now()
  );

  create table public.profiles (
    id uuid primary key references auth.users(id),
    plan text,
    ai_runs_used int not null default 0,
    ai_runs_reset_at timestamptz,
    paddle_customer_id text,
    created_at timestamptz not null default now()
  );

  alter table public.clients enable row level security;
  alter table public.projects enable row level security;
  alter table public.activities enable row level security;
  alter table public.indicators enable row level security;
  alter table public.risks enable row level security;
  alter table public.deliverables enable row level security;
  alter table public.project_documents enable row level security;
  alter table public.reports enable row level security;
  alter table public.ai_agents enable row level security;
  alter table public.prompt_modules enable row level security;
  alter table public.agent_runs enable row level security;
  alter table public.profiles enable row level security;

  -- Baseline creator-scoped policies, matching Project Operations spec
  -- §1.1's documented pre-migration behaviour ("Scoped to created_by =
  -- auth.uid()" for projects; "any authenticated user" for clients). The
  -- 01-16 sequence layers organisation-scoped policies alongside these,
  -- consistent with its own "existing policy stays, new policy added
  -- alongside" design note (Database Schema spec §1). Service-role Edge
  -- Function calls (every Edge Function in this repo) bypass RLS entirely,
  -- so these baseline policies matter for direct-client access, not for
  -- exercising the functions themselves.
  create policy "clients_all_authenticated" on public.clients for all
    to authenticated using (true) with check (true);
  create policy "projects_creator" on public.projects for all
    to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
  create policy "activities_via_project" on public.activities for all
    to authenticated using (project_id in (select id from public.projects where created_by = auth.uid()));
  create policy "indicators_via_project" on public.indicators for all
    to authenticated using (project_id in (select id from public.projects where created_by = auth.uid()));
  create policy "risks_via_project" on public.risks for all
    to authenticated using (project_id in (select id from public.projects where created_by = auth.uid()));
  create policy "deliverables_via_project" on public.deliverables for all
    to authenticated using (project_id in (select id from public.projects where created_by = auth.uid()));
  create policy "project_documents_via_project" on public.project_documents for all
    to authenticated using (project_id in (select id from public.projects where created_by = auth.uid()));
  create policy "reports_via_project" on public.reports for all
    to authenticated using (project_id in (select id from public.projects where created_by = auth.uid()));
  create policy "ai_agents_select_all" on public.ai_agents for select to authenticated using (true);
  create policy "prompt_modules_select_all" on public.prompt_modules for select to authenticated using (true);
  create policy "agent_runs_via_project" on public.agent_runs for all
    to authenticated using (project_id in (select id from public.projects where created_by = auth.uid()));
  create policy "profiles_own_row" on public.profiles for all
    to authenticated using (id = auth.uid()) with check (id = auth.uid());
end $$;
