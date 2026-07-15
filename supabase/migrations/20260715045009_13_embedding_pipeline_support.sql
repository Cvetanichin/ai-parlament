-- ADR-0010 §5–§11: support objects for embedding-pipeline-run.
--
-- 1. Sentinel "Platform" organisation.
--    audit_events.organisation_id is NOT NULL, but the embedding pipeline
--    is a platform-level operation over global tables (regulatory_clauses,
--    knowledge_chunks) that have no organisation of their own. Rather than
--    relax a shared-table constraint for one function, we attribute all
--    platform-service audits to a single sentinel organisation. Approved
--    by Product Owner alongside ADR-0010 (option: "Sentinel Platform
--    organisation").
--
-- 2. apply_embedding_batch RPC.
--    ADR-0010 §9 step 4 requires "a single transaction per batch" for the
--    UPDATE of embedding, embedding_model, embedded_at. The Supabase JS
--    client cannot span a transaction across independent .update() calls,
--    so the write happens through this SECURITY DEFINER function which
--    takes a jsonb array of {id, embedding} rows, validates the source
--    table against a fixed allowlist, and performs one UPDATE ... FROM
--    per batch. Restricted to service_role.

insert into public.organisations (id, name)
values ('00000000-0000-0000-0000-0000000ad010', 'Platform')
on conflict (id) do nothing;

create or replace function public.apply_embedding_batch(
  p_source_table text,
  p_model text,
  p_embedded_at timestamptz,
  p_rows jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if p_source_table not in (
    'regulatory_clauses',
    'knowledge_chunks',
    'knowledge_documents',
    'opportunities',
    'memory_entries'
  ) then
    raise exception 'apply_embedding_batch: unknown source_table %', p_source_table
      using errcode = '22023';
  end if;

  if p_source_table = 'regulatory_clauses' then
    update public.regulatory_clauses t
       set embedding = (r->>'embedding')::vector,
           embedding_model = p_model,
           embedded_at = p_embedded_at
      from jsonb_array_elements(p_rows) r
     where t.id = (r->>'id')::uuid;
  elsif p_source_table = 'knowledge_chunks' then
    update public.knowledge_chunks t
       set embedding = (r->>'embedding')::vector,
           embedding_model = p_model,
           embedded_at = p_embedded_at
      from jsonb_array_elements(p_rows) r
     where t.id = (r->>'id')::uuid;
  elsif p_source_table = 'knowledge_documents' then
    update public.knowledge_documents t
       set embedding = (r->>'embedding')::vector,
           embedding_model = p_model,
           embedded_at = p_embedded_at
      from jsonb_array_elements(p_rows) r
     where t.id = (r->>'id')::uuid;
  elsif p_source_table = 'opportunities' then
    update public.opportunities t
       set embedding = (r->>'embedding')::vector,
           embedding_model = p_model,
           embedded_at = p_embedded_at
      from jsonb_array_elements(p_rows) r
     where t.id = (r->>'id')::uuid;
  elsif p_source_table = 'memory_entries' then
    update public.memory_entries t
       set embedding = (r->>'embedding')::vector,
           embedding_model = p_model,
           embedded_at = p_embedded_at
      from jsonb_array_elements(p_rows) r
     where t.id = (r->>'id')::uuid;
  end if;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.apply_embedding_batch(text, text, timestamptz, jsonb) from public;
revoke all on function public.apply_embedding_batch(text, text, timestamptz, jsonb) from anon, authenticated;
grant execute on function public.apply_embedding_batch(text, text, timestamptz, jsonb) to service_role;
