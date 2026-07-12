alter table public.profiles add column is_platform_operator boolean not null default false;
alter table public.memory_entries add column justification text;

alter table public.notification_channels add column config_secret_id uuid;
alter table public.organisation_members
  add constraint organisation_members_role_check
  check (role in ('owner', 'admin', 'member', 'viewer'));

create table public.eligibility_reports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  opportunity_id uuid not null references public.opportunities(id),
  operational_capacity_status text check (operational_capacity_status in ('pass','warning','fail')),
  financial_capacity_status text check (financial_capacity_status in ('pass','warning','fail')),
  geographic_eligibility_status text check (geographic_eligibility_status in ('pass','warning','fail')),
  consortium_requirements_status text check (consortium_requirements_status in ('pass','warning','fail')),
  budget_ceiling_fit_status text check (budget_ceiling_fit_status in ('pass','warning','fail')),
  risk_flags text[] default '{}',
  recommendation text check (recommendation in ('go','no_go','needs_review')),
  created_at timestamptz not null default now()
);
alter table public.eligibility_reports enable row level security;
create policy "eligibility_reports_select" on public.eligibility_reports for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "eligibility_reports_insert" on public.eligibility_reports for insert
  to authenticated with check (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));

alter table public.indicators add column proposal_id uuid references public.proposals(id);
alter table public.indicators alter column project_id drop not null;

alter table public.compliance_findings add column override_justification text;

alter table public.reports drop constraint if exists reports_report_type_check;
alter table public.reports add constraint reports_report_type_check
  check (report_type in ('monthly_report','me_brief','compliance_review','interim_narrative','final_narrative'));

create table public.submission_packages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  proposal_id uuid not null references public.proposals(id),
  status text not null check (status in ('compiling','ready_for_review','submitted')) default 'compiling',
  compiled_documents jsonb not null default '[]',
  compliance_status_snapshot text check (compliance_status_snapshot in ('pass','warning_overridden')),
  submitted_by uuid references auth.users(id),
  submitted_at timestamptz
);
alter table public.submission_packages enable row level security;
create policy "submission_packages_select" on public.submission_packages for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "submission_packages_insert" on public.submission_packages for insert
  to authenticated with check (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
revoke update on public.submission_packages from authenticated;
