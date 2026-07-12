alter table public.agent_runs add column source text not null default 'production'
  check (source in ('production','house_of_parliament'));

create table public.cost_rollups (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  scope_type text not null check (scope_type in ('ministry','proposal','project','user')),
  scope_id uuid not null,
  period_start date not null,
  period_end date not null,
  total_token_cost numeric not null default 0,
  total_invocations integer not null default 0,
  confidence_distribution jsonb default '{}',
  computed_at timestamptz not null default now()
);
alter table public.cost_rollups enable row level security;
create policy "cost_rollups_select" on public.cost_rollups for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));

create table public.ai_app_register (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id),
  application_or_ministry text not null,
  owner uuid references auth.users(id),
  purpose text not null,
  vendor_model text not null,
  data_sources text[] default '{}',
  risk_tier text not null check (risk_tier in ('minimal','limited','high_risk_equivalent')),
  oversight_matrix_ref text,
  monitoring_kpis text[] default '{}',
  review_cadence text not null default 'quarterly',
  last_reviewed_at date,
  created_at timestamptz not null default now()
);
alter table public.ai_app_register enable row level security;
create policy "ai_app_register_select" on public.ai_app_register for select
  to authenticated using (
    organisation_id is null or organisation_id in (
      select organisation_id from public.organisation_members where user_id = (select auth.uid())
    )
  );
