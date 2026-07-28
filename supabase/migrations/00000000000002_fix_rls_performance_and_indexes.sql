-- ============================================================
-- Fix RLS performance, add FK indexes, tighten clients policies
-- ============================================================

-- Fix 1: RLS init plan — wrap auth.uid() in (select ...) so
-- Postgres evaluates it once per query, not once per row.

-- projects
drop policy if exists "projects_select" on public.projects;
drop policy if exists "projects_insert" on public.projects;
drop policy if exists "projects_update" on public.projects;
drop policy if exists "projects_delete" on public.projects;

create policy "projects_select" on public.projects for select to authenticated using ((select auth.uid()) = created_by);
create policy "projects_insert" on public.projects for insert to authenticated with check ((select auth.uid()) = created_by);
create policy "projects_update" on public.projects for update to authenticated using ((select auth.uid()) = created_by);
create policy "projects_delete" on public.projects for delete to authenticated using ((select auth.uid()) = created_by);

-- activities
drop policy if exists "activities_select" on public.activities;
drop policy if exists "activities_insert" on public.activities;
drop policy if exists "activities_update" on public.activities;
drop policy if exists "activities_delete" on public.activities;

create policy "activities_select" on public.activities for select to authenticated
  using (project_id in (select id from public.projects where created_by = (select auth.uid())));
create policy "activities_insert" on public.activities for insert to authenticated
  with check (project_id in (select id from public.projects where created_by = (select auth.uid())));
create policy "activities_update" on public.activities for update to authenticated
  using (project_id in (select id from public.projects where created_by = (select auth.uid())));
create policy "activities_delete" on public.activities for delete to authenticated
  using (project_id in (select id from public.projects where created_by = (select auth.uid())));

-- indicators
drop policy if exists "indicators_select" on public.indicators;
drop policy if exists "indicators_insert" on public.indicators;
drop policy if exists "indicators_update" on public.indicators;
drop policy if exists "indicators_delete" on public.indicators;

create policy "indicators_select" on public.indicators for select to authenticated
  using (project_id in (select id from public.projects where created_by = (select auth.uid())));
create policy "indicators_insert" on public.indicators for insert to authenticated
  with check (project_id in (select id from public.projects where created_by = (select auth.uid())));
create policy "indicators_update" on public.indicators for update to authenticated
  using (project_id in (select id from public.projects where created_by = (select auth.uid())));
create policy "indicators_delete" on public.indicators for delete to authenticated
  using (project_id in (select id from public.projects where created_by = (select auth.uid())));

-- risks
drop policy if exists "risks_select" on public.risks;
drop policy if exists "risks_insert" on public.risks;
drop policy if exists "risks_update" on public.risks;
drop policy if exists "risks_delete" on public.risks;

create policy "risks_select" on public.risks for select to authenticated
  using (project_id in (select id from public.projects where created_by = (select auth.uid())));
create policy "risks_insert" on public.risks for insert to authenticated
  with check (project_id in (select id from public.projects where created_by = (select auth.uid())));
create policy "risks_update" on public.risks for update to authenticated
  using (project_id in (select id from public.projects where created_by = (select auth.uid())));
create policy "risks_delete" on public.risks for delete to authenticated
  using (project_id in (select id from public.projects where created_by = (select auth.uid())));

-- project_documents
drop policy if exists "project_documents_select" on public.project_documents;
drop policy if exists "project_documents_insert" on public.project_documents;
drop policy if exists "project_documents_update" on public.project_documents;
drop policy if exists "project_documents_delete" on public.project_documents;

create policy "project_documents_select" on public.project_documents for select to authenticated
  using (project_id in (select id from public.projects where created_by = (select auth.uid())));
create policy "project_documents_insert" on public.project_documents for insert to authenticated
  with check (project_id in (select id from public.projects where created_by = (select auth.uid())));
create policy "project_documents_update" on public.project_documents for update to authenticated
  using (project_id in (select id from public.projects where created_by = (select auth.uid())));
create policy "project_documents_delete" on public.project_documents for delete to authenticated
  using (project_id in (select id from public.projects where created_by = (select auth.uid())));

-- deliverables
drop policy if exists "deliverables_select" on public.deliverables;
drop policy if exists "deliverables_insert" on public.deliverables;
drop policy if exists "deliverables_update" on public.deliverables;
drop policy if exists "deliverables_delete" on public.deliverables;

create policy "deliverables_select" on public.deliverables for select to authenticated
  using (project_id in (select id from public.projects where created_by = (select auth.uid())));
create policy "deliverables_insert" on public.deliverables for insert to authenticated
  with check (project_id in (select id from public.projects where created_by = (select auth.uid())));
create policy "deliverables_update" on public.deliverables for update to authenticated
  using (project_id in (select id from public.projects where created_by = (select auth.uid())));
create policy "deliverables_delete" on public.deliverables for delete to authenticated
  using (project_id in (select id from public.projects where created_by = (select auth.uid())));

-- reports
drop policy if exists "reports_select" on public.reports;
drop policy if exists "reports_insert" on public.reports;
drop policy if exists "reports_update" on public.reports;
drop policy if exists "reports_delete" on public.reports;

create policy "reports_select" on public.reports for select to authenticated
  using (project_id in (select id from public.projects where created_by = (select auth.uid())));
create policy "reports_insert" on public.reports for insert to authenticated
  with check (project_id in (select id from public.projects where created_by = (select auth.uid())));
create policy "reports_update" on public.reports for update to authenticated
  using (project_id in (select id from public.projects where created_by = (select auth.uid())));
create policy "reports_delete" on public.reports for delete to authenticated
  using (project_id in (select id from public.projects where created_by = (select auth.uid())));

-- agent_runs
drop policy if exists "agent_runs_select" on public.agent_runs;
drop policy if exists "agent_runs_insert" on public.agent_runs;
drop policy if exists "agent_runs_update" on public.agent_runs;
drop policy if exists "agent_runs_delete" on public.agent_runs;

create policy "agent_runs_select" on public.agent_runs for select to authenticated
  using (project_id in (select id from public.projects where created_by = (select auth.uid())));
create policy "agent_runs_insert" on public.agent_runs for insert to authenticated
  with check (project_id in (select id from public.projects where created_by = (select auth.uid())));
create policy "agent_runs_update" on public.agent_runs for update to authenticated
  using (project_id in (select id from public.projects where created_by = (select auth.uid())));
create policy "agent_runs_delete" on public.agent_runs for delete to authenticated
  using (project_id in (select id from public.projects where created_by = (select auth.uid())));

-- Fix 2: clients — add created_by to scope write operations
alter table public.clients add column if not exists created_by uuid references auth.users(id) on delete set null;

drop policy if exists "clients_insert" on public.clients;
drop policy if exists "clients_update" on public.clients;
drop policy if exists "clients_delete" on public.clients;

create policy "clients_insert" on public.clients for insert to authenticated
  with check ((select auth.uid()) = created_by);
create policy "clients_update" on public.clients for update to authenticated
  using ((select auth.uid()) = created_by);
create policy "clients_delete" on public.clients for delete to authenticated
  using ((select auth.uid()) = created_by);

-- Fix 3: Drop rls_auto_enable and its dependent event trigger
drop event trigger if exists ensure_rls;
drop function if exists public.rls_auto_enable() cascade;

-- Fix 4: Indexes on all unindexed foreign keys
create index if not exists idx_projects_created_by           on public.projects(created_by);
create index if not exists idx_projects_client_id            on public.projects(client_id);

create index if not exists idx_activities_project_id         on public.activities(project_id);
create index if not exists idx_indicators_project_id         on public.indicators(project_id);
create index if not exists idx_risks_project_id              on public.risks(project_id);

create index if not exists idx_project_documents_project_id  on public.project_documents(project_id);
create index if not exists idx_project_documents_uploaded_by on public.project_documents(uploaded_by);

create index if not exists idx_deliverables_project_id       on public.deliverables(project_id);
create index if not exists idx_deliverables_activity_id      on public.deliverables(activity_id);

create index if not exists idx_reports_project_id            on public.reports(project_id);
create index if not exists idx_reports_generated_by          on public.reports(generated_by);

create index if not exists idx_agent_runs_project_id         on public.agent_runs(project_id);
create index if not exists idx_agent_runs_agent_id           on public.agent_runs(agent_id);
create index if not exists idx_agent_runs_report_id          on public.agent_runs(report_id);
create index if not exists idx_agent_runs_triggered_by       on public.agent_runs(triggered_by);

create index if not exists idx_prompt_modules_agent_id       on public.prompt_modules(agent_id);
create index if not exists idx_clients_created_by            on public.clients(created_by);
