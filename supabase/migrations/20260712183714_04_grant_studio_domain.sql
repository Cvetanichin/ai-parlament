-- Database Schema spec §5. APPLIED to staging and production 12 July 2026.
alter table public.clients add column areas_of_interest text;
alter table public.projects add column stage text
  check (stage in ('pre_award','post_award')) default 'post_award';
alter table public.projects add column opportunity_id uuid;
alter table public.projects add column prag_version text not null default '2025';

alter table public.reports drop constraint if exists reports_report_type_check;
alter table public.reports add constraint reports_report_type_check
  check (report_type in ('monthly_report','me_brief','compliance_review'));

create table public.donors (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null,
  official_website text,
  region text,
  funder_type text,
  donor_status text check (donor_status in
    ('current_donor','warm_prospect','former_donor','cold_prospect','new_funder','revisit_prospect','disqualified')),
  pipeline_stage text,
  priority text,
  relevance text,
  comments text,
  areas_of_interest text,
  last_action text,
  next_action text,
  relationship_owner uuid references auth.users(id),
  last_updated date
);
alter table public.donors enable row level security;
create policy "donors_select" on public.donors for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "donors_insert" on public.donors for insert
  to authenticated with check (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "donors_update" on public.donors for update
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  donor_id uuid references public.donors(id),
  external_id text,
  cluster text,
  is_new boolean default false,
  title text not null,
  description text,
  tags text[] default '{}',
  tag_confidence jsonb,
  eligibility_summary text,
  region text,
  funding_type text,
  application_type text,
  amount_min numeric,
  amount_max numeric,
  currency text,
  deadline date,
  status text check (status in ('open','forthcoming','rolling','closed','archived')),
  strategic_narrative text,
  risk_score numeric,
  relevance_score numeric,
  source_url text,
  scrape_note text,
  version int not null default 1,
  flags jsonb default '[]',
  embedding extensions.vector(1536),
  created_at timestamptz not null default now()
);
create index on public.opportunities using hnsw (embedding extensions.vector_cosine_ops);
alter table public.projects add constraint projects_opportunity_id_fkey
  foreign key (opportunity_id) references public.opportunities(id);
alter table public.opportunities enable row level security;
create policy "opportunities_select" on public.opportunities for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "opportunities_insert" on public.opportunities for insert
  to authenticated with check (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "opportunities_update" on public.opportunities for update
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  opportunity_id uuid not null references public.opportunities(id),
  client_id uuid references public.clients(id),
  stage text check (stage in ('concept_note','full_application')),
  status text not null,
  version int not null default 1,
  created_at timestamptz not null default now()
);
alter table public.proposals enable row level security;
create policy "proposals_select" on public.proposals for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "proposals_insert" on public.proposals for insert
  to authenticated with check (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "proposals_update" on public.proposals for update
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));

create table public.proposal_sections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  proposal_id uuid not null references public.proposals(id),
  section_key text not null,
  content text,
  workflow_instance_id uuid references public.workflow_instances(id)
);
alter table public.proposal_sections enable row level security;
create policy "proposal_sections_select" on public.proposal_sections for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "proposal_sections_insert" on public.proposal_sections for insert
  to authenticated with check (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "proposal_sections_update" on public.proposal_sections for update
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  proposal_id uuid references public.proposals(id),
  project_id uuid references public.projects(id),
  line_items jsonb not null,
  indirect_cost_rate numeric,
  currency text
);
alter table public.budgets enable row level security;
create policy "budgets_select" on public.budgets for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "budgets_insert" on public.budgets for insert
  to authenticated with check (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "budgets_update" on public.budgets for update
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  proposal_id uuid references public.proposals(id),
  project_id uuid references public.projects(id),
  legal_name text not null,
  pic_pador text,
  role text check (role in ('lead_applicant','co_applicant','associate')),
  lef_status text,
  fif_status text,
  declaration_of_honour_status text,
  due_diligence_status text,
  subcontract_value numeric,
  due_diligence_refresh_date date,
  performance_rating numeric
);
alter table public.partners enable row level security;
create policy "partners_select" on public.partners for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "partners_insert" on public.partners for insert
  to authenticated with check (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "partners_update" on public.partners for update
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));

create table public.logframe_narratives (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  proposal_id uuid references public.proposals(id),
  project_id uuid references public.projects(id),
  theory_of_change text,
  assumptions text,
  intervention_logic jsonb
);
alter table public.logframe_narratives enable row level security;
create policy "logframe_narratives_select" on public.logframe_narratives for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "logframe_narratives_insert" on public.logframe_narratives for insert
  to authenticated with check (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "logframe_narratives_update" on public.logframe_narratives for update
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
