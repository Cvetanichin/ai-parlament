-- ADR-0010 §3: Embedding provenance columns.
--
-- Two columns added to every table that carries an embedding vector, so a
-- future provider or model change is a detectable, auditable event rather
-- than a silent inconsistency. Additive only; both stay null until the
-- embedding-pipeline-run function writes a real vector back.

alter table public.regulatory_clauses
  add column embedding_model text,
  add column embedded_at timestamptz;

alter table public.knowledge_chunks
  add column embedding_model text,
  add column embedded_at timestamptz;

alter table public.knowledge_documents
  add column embedding_model text,
  add column embedded_at timestamptz;

alter table public.opportunities
  add column embedding_model text,
  add column embedded_at timestamptz;

alter table public.memory_entries
  add column embedding_model text,
  add column embedded_at timestamptz;
