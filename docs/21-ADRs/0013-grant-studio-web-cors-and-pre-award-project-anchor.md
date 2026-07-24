---
adr: 0013
title: Grant Studio Web — CORS-Enabled Edge Functions and Pre-Award Project Anchoring
status: Accepted
date: 2026-07-24
amends: ../../supabase/README.md, ../../supabase/functions/_shared/auth.ts, ../../supabase/functions/_shared/workflowEngine.ts
---

# ADR-0013: Grant Studio Web — CORS-Enabled Edge Functions and Pre-Award Project Anchoring

## Context

`apps/grant-studio-web` (`../13-Frontend/`) is the first real browser caller
of any Edge Function in this repo. Every prior verification of
`eligibility-report-run`/`-get`, `workflow-research-run`,
`workflow-governance-run`, `workflow-gate-decide`, and
`prompt-orchestration-run` (see `../../supabase/README.md`'s Verification
section) was done server-to-server — curl with a real session token, or a
service-role JWT. None of that path ever triggers a browser's CORS
preflight, so the gap was invisible until a real `<script>`-origin `fetch()`
call happened for the first time, live, 24 July 2026.

Separately, wiring the Grant Studio frontend's Go/No-Go flow (Opportunity →
Proposal → Eligibility Report → Research Ministry's Risk Matrix → Human
Gate 2) surfaced a real architectural question `../../supabase/README.md`
had explicitly flagged as unresolved: `workflow-research-run` and
`workflow-gate-decide` both resolve the caller's organisation via a
`projects` row (`auth.ts`'s `resolveCaller`), and `agent_runs.project_id` is
a real, live `NOT NULL` foreign key — so the Research Ministry cannot run at
all without a real `projects` row to record its `agent_runs` invocation
against. But Grant Studio's pre-award lifecycle (`Proposal`, not `Project`)
has no `Project` yet at Go/No-Go time — award hasn't happened. The previous
README note assumed this meant "no first-class Opportunity flows through a
workflow instance yet" and left the Go/No-Go gate's eligibility precondition
unimplemented rather than guess at a linkage shape.

## Decision

**CORS.** Add `supabase/functions/_shared/cors.ts`, exporting `withCors()` —
a wrapper around a `Deno.serve` handler that short-circuits an `OPTIONS`
request with `204` + `Access-Control-Allow-*` headers, and stamps the same
headers onto every real response (success or error) the wrapped handler
produces. Every function is updated to `Deno.serve(withCors(async (req) =>
{ ... }))` — a one-line wrap per function, no changes to any function's
actual request handling logic. `Access-Control-Allow-Origin: *` is used
(not an allowlist) since every one of these functions already requires a
valid Supabase JWT (`verify_jwt: true` at the platform level, plus
`resolveCaller`'s own token validation) — the origin header adds no real
authorization value here; the JWT is the actual gate.

**Pre-award project anchoring.** Rather than invent a new mechanism or
weaken `agent_runs.project_id`'s `NOT NULL` constraint, `grant-studio-web`
creates (or reuses) a real `projects` row at Go/No-Go time via
`ensureProjectForOpportunity()` — a direct, RLS-scoped client insert, not an
Edge Function call, since it's plain row creation with no cross-service
business rule (`../13-Frontend/` §2's direct-vs-Gateway split). This is not
a workaround: `projects.stage`'s own `CHECK` constraint already allows
`'pre_award'` (`ARRAY['pre_award','post_award']`), which only makes sense if
a `projects` row is meant to exist before award — confirmed against the
real, live constraint, not assumed from the Domain Model spec's informal
"Project (post-award)" description. The project is looked up by
`(organisation_id, opportunity_id)` (1:1 in practice, per Product Vision §2's
single-Organisation-at-v1 framing) rather than adding a new column to either
`proposals` or `projects` — no schema change was needed.

`workflow_instances` targets this `projects.id` (`target_type: 'project'`,
matching every other caller's convention — `workflow-research-run`,
`workflow-governance-run`), created via a direct client insert mirroring
`startInstance()`'s exact two-row sequence (`workflow_instances` +
`workflow_instance_history`), since `workflow_instances_insert`'s RLS policy
already permits this and no Edge Function exposes `startInstance()`
generically today.

## Consequences

- Every Edge Function in this repo is now callable from a browser, not just
  server-to-server — a precondition for any future frontend phase (Concept
  Note drafting, Logframe, Budget) that calls these same functions, not a
  Grant-Studio-specific fix.
- The Eligibility Report is now surfaced to the human directly inside the
  Go/No-Go gate's UI (`HumanGate`'s `supportingRecords`), alongside the
  Research Ministry's Risk Matrix — a human deciding the gate sees both.
  **`decideGate` itself still does not hard-block the gate server-side if no
  `eligibility_reports` row exists** (Grant Studio §3's "the platform blocks
  the gate server-side if Research has not run") — today that's a UI
  convenience only, per `../13-Frontend/` §7's "no client-side-only gating"
  NFR this therefore does not yet fully satisfy. Real, addressable gap, not
  closed by this ADR — see `supabase/README.md`'s "What's NOT done yet".
- A `projects` row is now created earlier in the lifecycle than
  `../02-Domain-Model/`'s informal framing suggested — before award, not at
  it. `projects.stage` is the field that already tracks this transition, so
  awarding a proposal later is an update (`stage: 'pre_award' → 'post_award'`),
  not a new-row creation. Project Operations (`../08-Project-Operations/`),
  whenever built, should read this stage field rather than assume every
  `projects` row is necessarily post-award.
- No new database migration was required for either fix — both are
  additive-only against constraints and columns that already existed.

## Alternatives considered

- **Allowlist specific origins instead of `Access-Control-Allow-Origin: *`.**
  Rejected for now: every function already requires a valid JWT, so an
  origin allowlist would add operational overhead (tracking every deploy
  environment's origin) without a corresponding real security gain. Revisit
  if a function is ever added that doesn't require `verify_jwt`.
- **A new Edge Function (`workflow-instance-start`) exposing `startInstance()`
  generically.** Rejected: `workflow_instances_insert`'s RLS policy already
  permits a direct, organisation-scoped client insert — adding a function
  whose only job is to perform an insert RLS already authorizes would be
  Gateway ceremony with no additional enforcement, contradicting
  `../13-Frontend/` §2's own direct-vs-Gateway principle.
- **Add a `project_id` column to `proposals` (or `proposal_id` to
  `projects`) instead of joining by `(organisation_id, opportunity_id)`.**
  Rejected: the join is already 1:1 in practice and requires no schema
  change; a new column would be pure redundancy against data the join
  already recovers exactly.
