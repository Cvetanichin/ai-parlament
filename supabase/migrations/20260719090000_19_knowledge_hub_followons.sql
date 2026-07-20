-- Knowledge Hub spec §1.2: "Optionally links to a Donor, Proposal, or
-- Project record for context (a related_entity_type/related_entity_id
-- pair on the knowledge_documents row — confirm this column exists per
-- Knowledge Platform spec; if not, it is a follow-on to that spec, not
-- invented fresh here)." Confirmed absent -- added here as that labelled
-- follow-on.
alter table public.knowledge_documents add column if not exists related_entity_type text
  check (related_entity_type is null or related_entity_type in ('donor', 'proposal', 'project'));
alter table public.knowledge_documents add column if not exists related_entity_id uuid;

-- Knowledge Hub §1.1 (Document Browser): "Calls the Knowledge Platform's
-- semantic search API — this application holds no embeddings logic
-- itself." That API doesn't exist yet anywhere in this codebase; this is
-- Knowledge Platform's (docs/06-) responsibility, not Knowledge Hub's own
-- scope, but Document Browser has nothing to call without it. Same
-- SECURITY DEFINER + service_role-only pattern as apply_embedding_batch
-- (migration 13) -- organisation scoping is enforced inside the function
-- itself (p_organisation_id), not left to the caller, so this is safe
-- regardless of which client calls it.
create or replace function public.match_knowledge_documents(
  p_query_embedding extensions.vector(1536),
  p_organisation_id uuid,
  p_document_type text default null,
  p_match_count int default 10
) returns table (
  id uuid,
  title text,
  document_type text,
  tags text[],
  similarity float
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
  select
    d.id,
    d.title,
    d.document_type,
    d.tags,
    1 - (d.embedding <=> p_query_embedding) as similarity
  from public.knowledge_documents d
  where d.organisation_id = p_organisation_id
    and d.embedding is not null
    and (p_document_type is null or d.document_type = p_document_type)
  order by d.embedding <=> p_query_embedding
  limit greatest(1, least(p_match_count, 50));
end;
$$;

revoke all on function public.match_knowledge_documents(extensions.vector, uuid, text, int) from public;
revoke all on function public.match_knowledge_documents(extensions.vector, uuid, text, int) from anon, authenticated;
grant execute on function public.match_knowledge_documents(extensions.vector, uuid, text, int) to service_role;
