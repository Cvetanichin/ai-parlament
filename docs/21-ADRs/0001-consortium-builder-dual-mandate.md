---
adr: 0001
title: Consortium Builder — Dual Pre-Award / Post-Award Mandate
status: Accepted
date: 2026-07-12
amends: ../07-Grant-Studio/Grant-Studio-Specification-v1.0.md §4
---

# ADR-0001: Consortium Builder — Dual Pre-Award / Post-Award Mandate

## Context

The initial draft of the Grant Studio specification scoped the Consortium
Builder (Module 3) as pre-award only: partner database, scoring, role
assignment, and due-diligence checks feeding a proposal. This left an open
question of whether it was in scope for the first Grant Studio increment at
all, and it did not address partnership management after a grant is awarded —
a real, recurring need (subcontract tracking, partner financial reporting,
amendment management) that would otherwise have to be invented later inside
Project Operations with no shared data model.

## Decision

Consortium Builder is confirmed in scope for the first Grant Studio increment,
with an explicit dual mandate:

1. **Pre-award** (built first, inside Grant Studio): partner due diligence,
   capacity scoring, role/mandate assignment, and management of the mandatory
   administrative documents PRAG and the specific call's Application require
   (Legal Entity File, Financial Identification Form, Declaration of Honour /
   Annex H, mandate letters, statutes, co-financing proof, key-staff CVs).
2. **Post-award** (consumed by Project Operations, not rebuilt): subcontract/
   sub-grant oversight, partner-level financial reporting consolidation,
   payment/transfer tracking, amendment management, periodic due-diligence
   refresh, and performance rating.

Both phases operate on a single `Partner` entity (EAS §4). Project Operations
does not maintain a separate partner record — it reads and extends the same
entity Consortium Builder creates pre-award.

## Consequences

- The `Partner` entity (EAS §4) must be designed from the start to carry
  post-award fields (subcontract value, due-diligence refresh date,
  performance rating), even though those fields are only populated once a
  project is awarded. Retrofitting them later would mean a schema migration
  across every already-awarded project.
- `docs/08-Project-Operations/` cannot be considered complete without defining
  which ministry owns the post-award half of Consortium Builder (open item,
  Grant Studio spec §13) — Reporting and Finance & Administration are the two
  candidates and neither has been confirmed.
- This is the first spec area to deliberately cross the Grant Studio /
  Project Operations application boundary at the data layer, which is a
  useful precedent: shared entities across applications are legitimate when
  the underlying real-world object (here, a consortium partner) genuinely
  persists across the pre/post-award boundary. Future specs should follow
  this pattern rather than duplicating entities per application.
