---
adr: 0004
title: Intelligence Workspace Integration — Full Data-Model Access, Additive Only
status: Accepted
date: 2026-07-12
amends: ../../00-EAS-v1.0.md §14, ../08-Project-Operations/README.md
---

# ADR-0004: Intelligence Workspace Integration — Full Data-Model Access, Additive Only

## Context

EAS §14 left open how deeply Project Operations (post-award) integrates with
the existing Intelligence Workspace SaaS at `cvetanichin.org`: full data-model
access, API-only integration, or treat-as-reference-and-rebuild.

## Decision

**Full data-model access**, with a binding constraint: the integration is
**additive only**. Project Operations reads from and writes new data into
Intelligence Workspace's actual data model — it does not modify Intelligence
Workspace's existing code or existing schema. Any new capability required
(new tables, new fields, new services) is appended alongside what exists,
never a change to what's already running.

This is a middle path between "API-only" (which would have limited Project
Operations to whatever surface Intelligence Workspace's existing API already
exposes, likely insufficient for the Consortium Builder post-award mandate,
ADR-0001) and "treat-as-reference-and-rebuild" (which would duplicate a
working system for no architectural benefit, violating EAS §2 principle 6 —
existing assets are integrated, not rebuilt).

## Consequences

- `docs/08-Project-Operations/` cannot be written to completion until the
  actual Intelligence Workspace data model is available for review — this
  ADR resolves *how deep* the integration goes, not *what* the schema
  contains. That remains an open blocker, tracked in that folder's README.
- Any schema or migration work touching Intelligence Workspace's database
  must be reviewed for whether it is additive (new tables/columns) or
  modifying (altering existing tables/columns actually used by Intelligence
  Workspace's current code) — the latter is out of bounds under this
  decision without a separate ADR explicitly authorising it.
- `docs/11-Database-Schema/` should treat Intelligence Workspace's database as
  a system it integrates with, not one it owns — the Parliamentary AI
  Ecosystem's own schema (Organisation, Project, Partner, etc.) may need
  foreign-key or sync relationships to Intelligence Workspace tables rather
  than assuming a single unified schema across both systems.
