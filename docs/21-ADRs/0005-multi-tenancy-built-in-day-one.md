---
adr: 0005
title: Multi-Tenancy Built Into the Schema From Day One
status: Accepted
date: 2026-07-12
amends: ../../00-EAS-v1.0.md §9, §14, ../11-Database-Schema/
---

# ADR-0005: Multi-Tenancy Built Into the Schema From Day One

## Context

EAS §14 left open whether org-level data isolation should be built into the
schema now, while it is greenfield, or deferred to Phase 5 as the original
roadmap assumed (multi-tenancy was scoped as a late-stage hardening item,
alongside auth, once a second CSO was actually being onboarded).

## Decision

**Build it in now.** Every tenant-scoped table in `docs/11-Database-Schema/`
carries an `organisation_id` from its first migration, enforced by PostgreSQL
Row-Level Security (RLS) policies, not application-level `WHERE` clauses
alone. This applies even though the platform will run single-tenant (this
organisation only) for the foreseeable near term.

## Consequences

- Marginal cost now is low — the domain model (EAS §4) already treats
  `Organisation` as first-class, so this is adding one column and one RLS
  policy per table during initial schema design, not a structural change.
- Retrofitting later would mean an in-place migration across every existing
  table plus backfilling `organisation_id` on every historical row (including
  audit log rows, which must never be altered post-write per EAS §9's
  auditability NFR) — meaningfully more expensive and riskier than doing it
  now.
- `docs/11-Database-Schema/` must specify RLS policies as part of the schema,
  not as a follow-on security pass — every table definition includes its
  tenant-isolation policy inline.
- Single-tenant operation continues to work exactly as before: with one
  `Organisation` row, RLS is a no-op in practice until a second tenant
  exists, so this decision has no near-term operational cost, only a
  structural one already absorbed at schema-design time.
- Auth/RBAC (`docs/16-Security/`) still needs its own spec — this ADR covers
  data isolation at the schema layer, not authentication or role-based access
  control, which remain separate work.
