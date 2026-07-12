---
adr: 0007
title: Supabase (Intelligence Workspace's Existing Project) as the Layer 4 Backbone
status: Accepted
date: 2026-07-12
amends: ../../00-EAS-v1.0.md §3.4, ../11-Database-Schema/, ../08-Project-Operations/, ../15-Infrastructure/
---

# ADR-0007: Supabase as the Layer 4 Backbone — CONFIRMED

**Accepted by Product Owner, 12 July 2026.** Option A below is the decision.
The "Option B" comparison is retained for the record, not as a live
alternative.

## Context

`docs/11-Database-Schema/` was written assuming a fresh PostgreSQL instance
for the new platform schema. Direct inspection of the Intelligence Workspace
codebase (the connected `FigmaProjects-main` folder) shows it already runs on
Supabase, and Supabase already provides most of Layer 4 out of the box:
PostgreSQL with `pgcrypto`, Auth (`auth.users`), Storage (a `documents`
bucket, already in use), and Edge Functions (Deno-based serverless compute,
already running four agent functions). Supabase also supports `pgvector`
natively, which is what ADR-0006 already chose.

This is a materially bigger finding than "there's an app to integrate with."
The question this ADR raises is whether the Parliamentary AI Ecosystem's new
Layer 3/4 schema (Workflow Engine, Agent Runtime, Regulatory Knowledge Layer,
the Grant Studio domain from `docs/11-Database-Schema/`) should be layered
**into this same Supabase project**, additively, rather than stood up as a
separate PostgreSQL instance that then has to sync or federate with
Intelligence Workspace's data.

Unlike ADRs 0001-0006, this one changes the blast radius of every future
migration — Intelligence Workspace is a live product with paying customers
(Paddle billing is wired and active; see §4 below), and a schema mistake here
risks production, not a greenfield environment. The mitigation below
(staging-branch validation) is therefore a hard requirement of acceptance,
not an optional nice-to-have.

## Option A: Single Supabase instance (this ADR's lean)

**For:**
- Avoids running and paying for two PostgreSQL instances plus a sync/
  federation layer between two systems of record for the same `Project`
  entity — the exact problem that shows up immediately otherwise, since
  Intelligence Workspace's real `projects` table already holds real data.
- Auth, Storage, and pgvector are already configured and working — Layer 4
  is largely already built, not something to build fresh.
- Consistent with the reasoning already applied in ADR-0006 (operational
  simplicity for a lean team) and EAS §2 principle 6 (integrate existing
  assets, don't rebuild) — applied at the infrastructure layer, not just the
  application layer this time.

**Against / risks:**
- **Blast radius.** New governance-layer migrations (Workflow Engine, Agent
  Runtime, Regulatory Knowledge Layer, multi-tenant RLS retrofit) would run
  against the same database serving live, billed users. A migration error
  is a production incident, not a rollback in a sandbox.
- **RLS model mismatch.** Intelligence Workspace's current RLS is scoped by
  `created_by = auth.uid()` — single-user ownership, no organisation concept
  at all. ADR-0005 (multi-tenancy from day one) has to be retrofitted onto a
  live table, not designed in from a blank schema — riskier and requires a
  careful, backward-compatible migration (see `docs/08-Project-Operations/`
  §5 for the proposed approach: auto-create one `Organisation` per existing
  user, add `organisation_id` alongside `created_by` without removing the
  latter).

**Mitigation if accepted:** every migration touching this schema goes through
a Supabase branch or a cloned staging project first (Supabase supports
database branching), validated, and only then promoted — this becomes a
concrete requirement in `docs/19-Deployment/`, not optional discipline.

## Option B: Separate PostgreSQL instance, federated

**For:** zero blast radius on the live product; the new platform can move
fast and break things in its own sandbox during Parliament Core / Regulatory
Knowledge Layer development.

**Against:** two systems of record for `Project` (and eventually `Partner`,
per ADR-0001's post-award mandate) means either duplicated data with sync
logic (a real, ongoing engineering cost and a source of drift bugs) or an
awkward split where some fields live in one database and some in the other.
This is the option EAS's original Layer 4 description implicitly assumed,
without having seen the actual Intelligence Workspace code at the time.

## Consequences

- **Single system of record.** `docs/11-Database-Schema/` §5 (Grant Studio
  Domain) is revised: `clients`, `projects`, `activities`, `indicators`,
  `risks`, `deliverables`, `project_documents`, `reports` are extended
  additively (new columns on the real, live tables) rather than created
  fresh. Only genuinely new concepts — `donors`, `opportunities`,
  `proposals`, `proposal_sections`, `partners`, `budgets`, and the
  Regulatory Knowledge Layer / Workflow Engine tables — are new `CREATE
  TABLE`s. See the revised spec for the full table-by-table disposition.
- **Agent Runtime seed, not rebuild.** `ai_agents`, `prompt_modules`, and
  `agent_runs` are extended (not replaced) to become the physical
  implementation of Parliament Core's `Agent`/`AgentVersion`/
  `AgentInvocation` (spec §3.6) — see `docs/08-Project-Operations/` §6.
- **Migration tooling resolved as a side effect.** The live repo already
  uses the `supabase/migrations/*.sql` convention (Supabase CLI). This is
  now the confirmed answer to `docs/11-Database-Schema/` §10's open
  migration-tooling question — no separate Node/Python migration tool is
  introduced.
- **Deployment discipline, not optional.** `docs/15-Infrastructure/` and
  `docs/19-Deployment/` must specify: every migration touching this schema
  is applied to a Supabase branch (or a cloned staging project) first,
  validated, then promoted — before this platform's first Parliament Core
  migration is written, not as a later hardening pass.
- **Multi-tenancy retrofit is real, not theoretical.** ADR-0005's
  `organisation_id` + RLS now applies to live tables with live rows — the
  backward-compatible migration in `docs/11-Database-Schema/` (auto-create
  one Organisation per existing user, additive column, dual RLS alongside
  the existing `created_by` policies) is mandatory, not a nice-to-have
  pattern kept in reserve.
