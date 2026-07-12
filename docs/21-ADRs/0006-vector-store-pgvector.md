---
adr: 0006
title: Vector Store — pgvector, Co-Located With PostgreSQL
status: Accepted
date: 2026-07-12
amends: ../../00-EAS-v1.0.md §3.4, §14, ../11-Database-Schema/, ../15-Infrastructure/
---

# ADR-0006: Vector Store — pgvector, Co-Located With PostgreSQL

## Context

EAS §14 left the choice open between pgvector (an extension inside the same
PostgreSQL instance already required for transactional state and the audit
log) and a dedicated vector engine such as Qdrant. Both were viable; the
Product Owner asked for an architect's recommendation rather than a forced
choice between the two.

## Decision

**pgvector**, co-located in the same PostgreSQL database as everything else.
Recommendation, not a default assumed without reasoning:

- **Operational simplicity dominates at this stage.** The platform runs with
  a lean team (Model A/B per the historical roadmap — a solo or small
  contractor-augmented setup, not a dedicated data-infra function). One
  database to provision, back up, secure, and monitor is a meaningfully
  smaller operational surface than two, and multi-tenancy (ADR-0005) and
  audit retention (EAS §9) are both easier to reason about with everything in
  one system with one transaction boundary.
- **Scale fit.** The near-term corpora — Regulatory Knowledge Layer clauses
  (tens of documents, thousands of clauses at most for Wave 1, `docs/05-`
  §2.1), Knowledge Platform documents, and Opportunity Intelligence records
  (tens to low hundreds per scrape session, per the live `funding-dashboard-
  v5.html` schema, ADR-0002) — are comfortably within pgvector's efficient
  range (PostgreSQL 16 with HNSW indexing handles this scale without
  difficulty). A dedicated engine's advantages — horizontal scaling, more
  advanced hybrid search, very large corpora — are not yet needed.
- **Joins matter here specifically.** Multi-tenancy (ADR-0005) and the
  Regulatory Knowledge Layer's clause-to-Compliance-Finding graph (`docs/05-`
  §4.6) both benefit from filtering and joining vector search results against
  relational data (organisation_id, document version, review status) inside
  a single query — straightforward in Postgres, an extra integration layer
  with a separate vector database.

## Consequences

- `docs/11-Database-Schema/` specifies the `pgvector` extension and embedding
  columns (with HNSW indexes) directly on the relevant tables
  (`RegulatoryClause`, `KnowledgeDocument`, `Opportunity`) rather than a
  separate vector-store schema.
- `docs/15-Infrastructure/` does not need to provision, secure, or budget for
  a second database service.
- **Explicit off-ramp, not a permanent commitment:** if the corpus grows to a
  scale where pgvector's indexing becomes a measured bottleneck (rough
  trigger: multi-million-row embedding tables, or a genuine need for
  hybrid/re-ranking search pgvector doesn't support well), that is a new ADR,
  not a silent migration. Nothing in this decision should be read as "never
  reconsider" — it is "not justified yet."
