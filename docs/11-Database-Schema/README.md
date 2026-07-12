---
status: APPROVED — approved by Product Owner 12 July 2026 — see Database-Schema-Specification-v1.0.md (now v1.4)
eas_reference: EAS v1.0 §4 (Domain Model), §3.4 (PostgreSQL), §13 priority 3
related_adrs: ../21-ADRs/0005-multi-tenancy-built-in-day-one.md, ../21-ADRs/0006-vector-store-pgvector.md, ../21-ADRs/0007-supabase-as-layer-4-backbone.md
---
# 11 — Database Schema

Full specification: `Database-Schema-Specification-v1.0.md` (v1.4) — the
single consolidated schema source for the whole platform. Consolidates
every entity from EAS §4, Grant Studio, Regulatory Knowledge Layer,
Parliament Core, Project Operations, Platform Services (§11, v1.2), **and
now Knowledge Platform (§13, added v1.3)** into the physical
Supabase/PostgreSQL schema, with multi-tenancy via `organisation_id` +
Row-Level Security on every tenant-scoped table (ADR-0005) and `pgvector`
embedding columns on `regulatory_clauses`, `opportunities`,
`knowledge_chunks`, and `memory_entries` (ADR-0006).

**v1.3 adds:** the original flat `knowledge_documents` table (§6) extended
with `document_type`/`tags`/`source_type`/`source_external_id`/`supersedes`,
plus two new tables — `knowledge_chunks` (chunk-level embeddings, replacing
the original one-embedding-per-document shape for anything longer than a
page) and `knowledge_document_links` (a lightweight entity-link table
standing in for a full knowledge graph at v1 scale).

**v1.4 adds (§15):** follow-on migrations from three newly-Approved specs —
`docs/10-House-of-Parliament/` (`profiles.is_platform_operator`,
`memory_entries.justification`), `docs/16-Security/`
(`notification_channels.config_secret_id` for Supabase Vault, the
four-role `organisation_members.role` CHECK constraint), and
`docs/07-Grant-Studio/` (`eligibility_reports`, `indicators.proposal_id`,
`compliance_findings.override_justification`, extended `reports.
report_type`, `submission_packages`).

Resolved since v1.0: migration tooling (Supabase CLI, ADR-0007), embedding
dimension (1536, OpenAI-style default), the Knowledge Platform seed corpus
(a dedicated Google Drive folder created and linked from the Knowledge
Platform spec) and its Template Detection confidence threshold (reuses the
Regulatory Knowledge Layer's 0.6 default, backed by a new
`knowledge_documents.review_status` column), institutional memory curation
authority, notification channel secret storage, the RBAC permission
matrix, and the Consortium Builder post-award ministry assignment. Three
items remain open — spec §14.
