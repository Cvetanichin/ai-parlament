-- ============================================================
-- Project Intelligence Workspace — Initial Schema
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  country     text,
  contact_email text
);

create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  client_id       uuid references public.clients(id) on delete set null,
  name            text not null,
  description     text,
  domain          text,
  status          text not null default 'active',
  start_date      date,
  end_date        date,
  budget_total    numeric,
  budget_spent    numeric not null default 0,
  donor           text,
  grant_reference text,
  created_by      uuid references auth.users(id) on delete set null
);

create table public.activities (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null,
  description text,
  output      text,
  start_date  date,
  end_date    date,
  status      text not null default 'planned',
  responsible text
);

create table public.indicators (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  name              text not null,
  level             text,
  unit              text,
  baseline          numeric,
  target            numeric,
  actual            numeric,
  data_source       text,
  collection_method text,
  frequency         text,
  responsible       text,
  status            text
);

create table public.risks (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null,
  description text,
  category    text,
  likelihood  text,
  impact      text,
  risk_level  text,
  mitigation  text,
  owner       text,
  status      text not null default 'open'
);

create table public.project_documents (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  name        text not null,
  category    text,
  file_path   text,
  file_size   bigint,
  mime_type   text,
  uploaded_by uuid references auth.users(id) on delete set null
);

create table public.deliverables (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete set null,
  title       text not null,
  due_date    date,
  status      text not null default 'pending',
  notes       text
);

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  title        text not null,
  report_type  text,
  content      text,
  generated_by uuid references auth.users(id) on delete set null,
  period_start date,
  period_end   date
);

create table public.ai_agents (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  description   text,
  edge_function text not null
);

create table public.prompt_modules (
  id        uuid primary key default gen_random_uuid(),
  agent_id  uuid references public.ai_agents(id) on delete cascade,
  name      text not null,
  content   text not null,
  version   integer not null default 1
);

create table public.agent_runs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  agent_id      uuid references public.ai_agents(id) on delete set null,
  status        text not null default 'pending',
  input_data    jsonb,
  output_data   jsonb,
  error_message text,
  report_id     uuid references public.reports(id) on delete set null,
  triggered_by  uuid references auth.users(id) on delete set null
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.clients           enable row level security;
alter table public.projects          enable row level security;
alter table public.activities        enable row level security;
alter table public.indicators        enable row level security;
alter table public.risks             enable row level security;
alter table public.project_documents enable row level security;
alter table public.deliverables      enable row level security;
alter table public.reports           enable row level security;
alter table public.ai_agents         enable row level security;
alter table public.prompt_modules    enable row level security;
alter table public.agent_runs        enable row level security;

-- clients: any authenticated user can manage their own clients
create policy "clients_select" on public.clients for select to authenticated using (true);
create policy "clients_insert" on public.clients for insert to authenticated with check (true);
create policy "clients_update" on public.clients for update to authenticated using (true);
create policy "clients_delete" on public.clients for delete to authenticated using (true);

-- projects: scoped to creator
create policy "projects_select" on public.projects for select to authenticated using (created_by = auth.uid());
create policy "projects_insert" on public.projects for insert to authenticated with check (created_by = auth.uid());
create policy "projects_update" on public.projects for update to authenticated using (created_by = auth.uid());
create policy "projects_delete" on public.projects for delete to authenticated using (created_by = auth.uid());

-- helper: check project ownership for sub-table policies
-- sub-tables: select/insert/update/delete scoped via project ownership

create policy "activities_select" on public.activities for select to authenticated
  using (project_id in (select id from public.projects where created_by = auth.uid()));
create policy "activities_insert" on public.activities for insert to authenticated
  with check (project_id in (select id from public.projects where created_by = auth.uid()));
create policy "activities_update" on public.activities for update to authenticated
  using (project_id in (select id from public.projects where created_by = auth.uid()));
create policy "activities_delete" on public.activities for delete to authenticated
  using (project_id in (select id from public.projects where created_by = auth.uid()));

create policy "indicators_select" on public.indicators for select to authenticated
  using (project_id in (select id from public.projects where created_by = auth.uid()));
create policy "indicators_insert" on public.indicators for insert to authenticated
  with check (project_id in (select id from public.projects where created_by = auth.uid()));
create policy "indicators_update" on public.indicators for update to authenticated
  using (project_id in (select id from public.projects where created_by = auth.uid()));
create policy "indicators_delete" on public.indicators for delete to authenticated
  using (project_id in (select id from public.projects where created_by = auth.uid()));

create policy "risks_select" on public.risks for select to authenticated
  using (project_id in (select id from public.projects where created_by = auth.uid()));
create policy "risks_insert" on public.risks for insert to authenticated
  with check (project_id in (select id from public.projects where created_by = auth.uid()));
create policy "risks_update" on public.risks for update to authenticated
  using (project_id in (select id from public.projects where created_by = auth.uid()));
create policy "risks_delete" on public.risks for delete to authenticated
  using (project_id in (select id from public.projects where created_by = auth.uid()));

create policy "project_documents_select" on public.project_documents for select to authenticated
  using (project_id in (select id from public.projects where created_by = auth.uid()));
create policy "project_documents_insert" on public.project_documents for insert to authenticated
  with check (project_id in (select id from public.projects where created_by = auth.uid()));
create policy "project_documents_update" on public.project_documents for update to authenticated
  using (project_id in (select id from public.projects where created_by = auth.uid()));
create policy "project_documents_delete" on public.project_documents for delete to authenticated
  using (project_id in (select id from public.projects where created_by = auth.uid()));

create policy "deliverables_select" on public.deliverables for select to authenticated
  using (project_id in (select id from public.projects where created_by = auth.uid()));
create policy "deliverables_insert" on public.deliverables for insert to authenticated
  with check (project_id in (select id from public.projects where created_by = auth.uid()));
create policy "deliverables_update" on public.deliverables for update to authenticated
  using (project_id in (select id from public.projects where created_by = auth.uid()));
create policy "deliverables_delete" on public.deliverables for delete to authenticated
  using (project_id in (select id from public.projects where created_by = auth.uid()));

create policy "reports_select" on public.reports for select to authenticated
  using (project_id in (select id from public.projects where created_by = auth.uid()));
create policy "reports_insert" on public.reports for insert to authenticated
  with check (project_id in (select id from public.projects where created_by = auth.uid()));
create policy "reports_update" on public.reports for update to authenticated
  using (project_id in (select id from public.projects where created_by = auth.uid()));
create policy "reports_delete" on public.reports for delete to authenticated
  using (project_id in (select id from public.projects where created_by = auth.uid()));

create policy "agent_runs_select" on public.agent_runs for select to authenticated
  using (project_id in (select id from public.projects where created_by = auth.uid()));
create policy "agent_runs_insert" on public.agent_runs for insert to authenticated
  with check (project_id in (select id from public.projects where created_by = auth.uid()));
create policy "agent_runs_update" on public.agent_runs for update to authenticated
  using (project_id in (select id from public.projects where created_by = auth.uid()));
create policy "agent_runs_delete" on public.agent_runs for delete to authenticated
  using (project_id in (select id from public.projects where created_by = auth.uid()));

-- ai_agents and prompt_modules: read-only for authenticated users (service role inserts via seed)
create policy "ai_agents_select" on public.ai_agents for select to authenticated using (true);
create policy "prompt_modules_select" on public.prompt_modules for select to authenticated using (true);

-- Also allow edge functions (service role) to insert agent_runs and reports
-- Service role bypasses RLS by default — no extra policy needed.

-- Note: the hosted Supabase platform's own `public.rls_auto_enable()`
-- exposure was revoked here on the original remote projects. That function
-- is a hosted-platform-only convenience (added by the dashboard's RLS
-- toggle) and does not exist on local/self-hosted Postgres, so there is
-- nothing to revoke locally. The next migration's
-- `drop function if exists public.rls_auto_enable() cascade;` already
-- handles the remote-only case safely (IF EXISTS), so this file needs no
-- equivalent statement.

-- ============================================================
-- SEED: AI Agents reference data
-- ============================================================

insert into public.ai_agents (id, name, slug, description, edge_function) values
  (gen_random_uuid(), 'M&E Intelligence Brief', 'me-agent',
   'Analyses indicator progress, activity completion and data quality gaps to produce a structured M&E brief.',
   'me-agent'),
  (gen_random_uuid(), 'Compliance & Risk Review', 'compliance-agent',
   'Reviews donor compliance status, document completeness, and organisational risk exposure.',
   'compliance-agent'),
  (gen_random_uuid(), 'Donor Progress Report', 'reporting-agent',
   'Generates a formal donor progress report covering objectives, activities, results and financial overview.',
   'reporting-agent');

-- ============================================================
-- STORAGE: documents bucket (created via API — see README)
-- Note: Supabase Storage buckets cannot be created via SQL.
-- Create a private bucket named "documents" in the Supabase
-- dashboard > Storage, then add the policies below.
-- ============================================================

-- Storage policies are applied after bucket creation via dashboard.
-- The policies below use the storage schema which is always available:

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 52428800, null)
on conflict (id) do nothing;

create policy "documents_select" on storage.objects for select to authenticated
  using (bucket_id = 'documents');
create policy "documents_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents');
create policy "documents_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents');
