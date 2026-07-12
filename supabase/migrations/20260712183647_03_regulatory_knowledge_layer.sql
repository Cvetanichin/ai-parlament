-- Database Schema spec §4. APPLIED to staging and production 12 July 2026.
create schema if not exists extensions;
create extension if not exists vector schema extensions;

create table public.regulatory_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in
    ('eu_prag','eu_contract','eu_guidelines','eu_application',
     'organisation_policy','national_law','internal_learned','ai_governance')),
  version text not null,
  effective_date date,
  supersedes uuid references public.regulatory_documents(id),
  jurisdiction text,
  source_url text,
  ingested_at timestamptz not null default now()
);
alter table public.regulatory_documents enable row level security;
create policy "regulatory_documents_select" on public.regulatory_documents
  for select to authenticated using (true);

create table public.regulatory_clauses (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.regulatory_documents(id),
  document_version text not null,
  section text,
  page int,
  text text not null,
  embedding extensions.vector(1536),
  obligation_type text check (obligation_type in
    ('mandatory','recommended','prohibited','context_dependent')),
  extraction_confidence numeric check (extraction_confidence between 0 and 1),
  related_clauses uuid[] default '{}',
  superseded_by uuid references public.regulatory_clauses(id),
  review_status text not null default 'auto_confirmed'
    check (review_status in ('auto_confirmed','needs_human_review','human_confirmed'))
);
create index on public.regulatory_clauses using hnsw (embedding extensions.vector_cosine_ops);
alter table public.regulatory_clauses enable row level security;
create policy "regulatory_clauses_select" on public.regulatory_clauses
  for select to authenticated using (true);

create table public.compliance_findings (   -- append-only
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  artefact_type text not null,
  artefact_id uuid not null,
  clause_id uuid not null references public.regulatory_clauses(id),
  rule text not null,
  source text not null,
  severity text not null check (severity in ('mandatory','recommended','info')),
  status text not null check (status in
    ('pass','warning','fail','context_dependent','needs_review')),
  flags jsonb default '[]',
  created_at timestamptz not null default now()
);
alter table public.compliance_findings enable row level security;
create policy "compliance_findings_select" on public.compliance_findings for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "compliance_findings_insert" on public.compliance_findings for insert
  to authenticated with check (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
