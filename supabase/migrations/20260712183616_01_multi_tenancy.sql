-- Database Schema spec §1 (ADR-0005, retrofitted per ADR-0007)
-- APPLIED to staging (urhocsijfzkepebsmstx) and production (jorpfsrvhnelnboupiyx) 12 July 2026.
-- This file is the source-controlled record; production's version additionally
-- backfilled organisation_id on pre-existing rows (see Database Schema spec §18).

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.organisation_members (
  organisation_id uuid not null references public.organisations(id),
  user_id uuid not null references auth.users(id),
  role text not null default 'member',
  primary key (organisation_id, user_id)
);

alter table public.organisations enable row level security;
create policy "organisations_select" on public.organisations for select
  to authenticated using (id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())
  ));

alter table public.organisation_members enable row level security;
create policy "organisation_members_select" on public.organisation_members
  for select to authenticated using (user_id = (select auth.uid()));

insert into public.organisations (id, name)
select gen_random_uuid(), coalesce(u.email, 'Organisation ' || u.id::text)
from (
  select distinct created_by as id_user from public.projects where created_by is not null
  union
  select distinct created_by as id_user from public.clients where created_by is not null
) x
join auth.users u on u.id = x.id_user;

insert into public.organisation_members (organisation_id, user_id, role)
select o.id, u.id, 'owner'
from auth.users u
join public.organisations o on o.name = coalesce(u.email, 'Organisation ' || u.id::text)
where u.id in (
  select distinct created_by from public.projects where created_by is not null
  union
  select distinct created_by from public.clients where created_by is not null
);

alter table public.clients            add column organisation_id uuid references public.organisations(id);
alter table public.projects           add column organisation_id uuid references public.organisations(id);
alter table public.activities         add column organisation_id uuid references public.organisations(id);
alter table public.indicators         add column organisation_id uuid references public.organisations(id);
alter table public.risks              add column organisation_id uuid references public.organisations(id);
alter table public.deliverables       add column organisation_id uuid references public.organisations(id);
alter table public.project_documents  add column organisation_id uuid references public.organisations(id);
alter table public.reports            add column organisation_id uuid references public.organisations(id);
alter table public.agent_runs         add column organisation_id uuid references public.organisations(id);

update public.clients c set organisation_id = om.organisation_id
  from public.organisation_members om where om.user_id = c.created_by;
update public.projects p set organisation_id = om.organisation_id
  from public.organisation_members om where om.user_id = p.created_by;
update public.activities a set organisation_id = p.organisation_id
  from public.projects p where p.id = a.project_id;
update public.indicators i set organisation_id = p.organisation_id
  from public.projects p where p.id = i.project_id;
update public.risks r set organisation_id = p.organisation_id
  from public.projects p where p.id = r.project_id;
update public.deliverables d set organisation_id = p.organisation_id
  from public.projects p where p.id = d.project_id;
update public.project_documents pd set organisation_id = p.organisation_id
  from public.projects p where p.id = pd.project_id;
update public.reports r set organisation_id = p.organisation_id
  from public.projects p where p.id = r.project_id;
update public.agent_runs ar set organisation_id = p.organisation_id
  from public.projects p where p.id = ar.project_id;

create policy "clients_org_select" on public.clients for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "clients_org_update" on public.clients for update
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "clients_org_delete" on public.clients for delete
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));

create policy "projects_org_select" on public.projects for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "projects_org_update" on public.projects for update
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "projects_org_delete" on public.projects for delete
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));

create policy "activities_org_select" on public.activities for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "activities_org_update" on public.activities for update
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "activities_org_delete" on public.activities for delete
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));

create policy "indicators_org_select" on public.indicators for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "indicators_org_update" on public.indicators for update
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "indicators_org_delete" on public.indicators for delete
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));

create policy "risks_org_select" on public.risks for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "risks_org_update" on public.risks for update
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "risks_org_delete" on public.risks for delete
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));

create policy "deliverables_org_select" on public.deliverables for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "deliverables_org_update" on public.deliverables for update
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "deliverables_org_delete" on public.deliverables for delete
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));

create policy "project_documents_org_select" on public.project_documents for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "project_documents_org_update" on public.project_documents for update
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "project_documents_org_delete" on public.project_documents for delete
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));

create policy "reports_org_select" on public.reports for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "reports_org_update" on public.reports for update
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "reports_org_delete" on public.reports for delete
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));

create policy "agent_runs_org_select" on public.agent_runs for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "agent_runs_org_update" on public.agent_runs for update
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "agent_runs_org_delete" on public.agent_runs for delete
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
