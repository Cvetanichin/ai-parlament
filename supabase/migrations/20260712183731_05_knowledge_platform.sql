create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  title text not null,
  source text,
  content text,
  embedding extensions.vector(1536),
  ingested_at timestamptz not null default now()
);
create index on public.knowledge_documents using hnsw (embedding extensions.vector_cosine_ops);

alter table public.knowledge_documents add column document_type text not null default 'other'
  check (document_type in ('past_proposal','lessons_learned','evaluation','sop','meeting_notes','template','other'));
alter table public.knowledge_documents add column tags text[] not null default '{}';
alter table public.knowledge_documents add column source_type text not null default 'manual_upload'
  check (source_type in ('google_drive','notion','project_documents','manual_upload'));
alter table public.knowledge_documents add column source_external_id text;
alter table public.knowledge_documents add column supersedes uuid references public.knowledge_documents(id);
alter table public.knowledge_documents add column review_status text not null default 'auto_confirmed'
  check (review_status in ('auto_confirmed','needs_review','human_confirmed'));

alter table public.knowledge_documents enable row level security;
create policy "knowledge_documents_select" on public.knowledge_documents for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "knowledge_documents_insert" on public.knowledge_documents for insert
  to authenticated with check (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "knowledge_documents_update" on public.knowledge_documents for update
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  knowledge_document_id uuid not null references public.knowledge_documents(id),
  chunk_index int not null,
  section_label text,
  content text not null,
  embedding extensions.vector(1536)
);
create index on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);
alter table public.knowledge_chunks enable row level security;
create policy "knowledge_chunks_select" on public.knowledge_chunks for select
  to authenticated using (knowledge_document_id in (
    select id from public.knowledge_documents where organisation_id in (
      select organisation_id from public.organisation_members where user_id = (select auth.uid()))));
create policy "knowledge_chunks_insert" on public.knowledge_chunks for insert
  to authenticated with check (knowledge_document_id in (
    select id from public.knowledge_documents where organisation_id in (
      select organisation_id from public.organisation_members where user_id = (select auth.uid()))));

create table public.knowledge_document_links (
  id uuid primary key default gen_random_uuid(),
  knowledge_document_id uuid not null references public.knowledge_documents(id),
  entity_type text not null check (entity_type in ('donor','project','partner','proposal')),
  entity_id uuid not null
);
create index on public.knowledge_document_links (entity_type, entity_id);
alter table public.knowledge_document_links enable row level security;
create policy "knowledge_document_links_select" on public.knowledge_document_links for select
  to authenticated using (knowledge_document_id in (
    select id from public.knowledge_documents where organisation_id in (
      select organisation_id from public.organisation_members where user_id = (select auth.uid()))));
create policy "knowledge_document_links_insert" on public.knowledge_document_links for insert
  to authenticated with check (knowledge_document_id in (
    select id from public.knowledge_documents where organisation_id in (
      select organisation_id from public.organisation_members where user_id = (select auth.uid()))));
