-- docs/05-Regulatory-Knowledge-Layer/ precedence-tier and scope columns for
-- regulatory_documents — resolving which rule wins when multiple documents
-- (PRAG, donor-specific Guidelines, organisational policy) speak to the same
-- clause.
--
-- Reconstructed from the live staging schema (urhocsijfzkepebsmstx): this
-- migration was originally applied directly against staging without ever
-- being committed to git, discovered as schema drift during the 18 Jul 2026
-- audit. Column defaults, CHECK constraints, and indexes below were read
-- back from staging's information_schema / pg_constraint / pg_indexes to
-- reproduce exactly what is already live there.
--
-- obligation_type, extraction_confidence, related_clauses, superseded_by,
-- review_status, and regulatory_documents.supersedes already exist as of
-- 03_regulatory_knowledge_layer.sql — not part of this migration.

alter table public.regulatory_documents
  add column if not exists precedence_tier integer not null default 2,
  add column if not exists scope text not null default 'general';

alter table public.regulatory_documents
  add constraint regulatory_documents_precedence_tier_check
    check (precedence_tier >= 1 and precedence_tier <= 3),
  add constraint regulatory_documents_scope_check
    check (scope = any (array['call_specific', 'general', 'organisation']));

create index if not exists idx_regulatory_documents_supersedes
  on public.regulatory_documents(supersedes);
create index if not exists idx_regulatory_clauses_superseded_by
  on public.regulatory_clauses(superseded_by);
