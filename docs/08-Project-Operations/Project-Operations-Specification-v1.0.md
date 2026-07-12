---
document: Project Operations (Post-Award) Specification
version: 1.1
status: APPROVED — approved by Product Owner 12 July 2026; no open items remain (§8)
parent: ../../00-EAS-v1.0.md (EAS §5 Applications Layer, §8 Existing Asset Integration Map)
related_adrs: ../21-ADRs/0001-consortium-builder-dual-mandate.md, ../21-ADRs/0004-intelligence-workspace-integration-depth.md, ../21-ADRs/0005-multi-tenancy-built-in-day-one.md, ../21-ADRs/0007-supabase-as-layer-4-backbone.md
existing_asset: FigmaProjects-main (Intelligence Workspace / "Project Progress Tracker") — live Supabase project, read directly for this spec
---

# Project Operations (Post-Award) — Specification v1.1

## 0. Note on Source Grounding

Unlike `docs/08`'s previous blocked state, this spec is grounded in the actual
Intelligence Workspace codebase — the connected folder — not a description of
it. Read directly: `supabase/migrations/20260609000001_initial_schema.sql`
(the full live schema), `src/lib/types.ts` (the TypeScript mirror of that
schema), and all four edge functions (`me-agent`, `compliance-agent`,
`reporting-agent`, `proposal-agent`). What follows is a factual audit, not an
integration plan written before seeing the target — the plan comes after the
audit, in §5 onward.

## 1. What Already Exists

### 1.1 Schema (live, in production use)

| Table | Purpose | Notes |
|---|---|---|
| `clients` | Client organisations | Scoped `select/insert/update/delete` to any authenticated user (not creator-scoped) — see §4.2 |
| `projects` | Core project entity | `client_id`, `name`, `domain`, `status`, dates, `budget_total`/`budget_spent`, `donor` (free text), `grant_reference`, `created_by`. Scoped to `created_by = auth.uid()` |
| `activities` | Project tasks | `title`, `output`, dates, `status`, `responsible` |
| `indicators` | M&E metrics | `level`, `unit`, `baseline`, `target`, `actual`, `data_source`, `collection_method`, `frequency`, `status` — this is materially more complete than a generic indicator table; it already matches most of Logframe Studio's indicator fields (Grant Studio spec §6) |
| `risks` | Risk register | `category`, `likelihood`, `impact`, `risk_level`, `mitigation`, `owner`, `status` |
| `deliverables` | Outputs linked to activities | |
| `project_documents` | File metadata | Actual files in a private Supabase Storage bucket named `documents` |
| `reports` | Generated narrative content | `report_type`, `content`, `period_start`/`period_end`, `generated_by` |
| `ai_agents` | Agent registry | `slug`, `edge_function` — seeded with `me-agent`, `compliance-agent`, `reporting-agent` (not `proposal-agent` — see §1.2) |
| `prompt_modules` | Versioned prompt storage | Schema exists (`agent_id`, `content`, `version`) — **not actually queried by any edge function** (§4.3) |
| `agent_runs` | Execution log | `status` (pending/running/completed/error), `input_data`, `output_data`, `error_message`, `report_id`, `triggered_by` — this is a real, working Agent Invocation log |
| `profiles` | Per-user subscription state | `plan`, `ai_runs_used`, `ai_runs_reset_at`, billing customer ID — added in a later migration (`20260617000001_profiles.sql`) |

### 1.2 Edge Functions (Deno, live)

| Function | Reads | Writes | Model call |
|---|---|---|---|
| `me-agent` | `projects`, `indicators`, `activities`, `risks` | `reports` (type `me_brief`), `agent_runs` | Direct Anthropic SDK call, hardcoded prompt, model pinned to `claude-sonnet-4-6` |
| `compliance-agent` | `projects`, `project_documents`, `risks`, `activities`, `indicators` | `reports` (type `compliance_review`), `agent_runs` | Same pattern |
| `reporting-agent` | `projects`, `indicators`, `activities`, `risks`, `project_documents` | `reports` (type `monthly_report`), `agent_runs` | Same pattern |
| `proposal-agent` | *(none — no project linkage)* | *(none — no persistence)* | Raw system+prompt passthrough to Anthropic; no `agent_runs` logging, not registered in `ai_agents` |

Two billing edge functions (`paddle-webhook`, `paddle-customer-portal`) and a
`paddle.ts` client file are also present — the project's payment provider is
**Paddle**, not Stripe. The connected repo's own `CLAUDE.md` documentation
still describes Stripe; that documentation is stale relative to the actual
code. Flagged as a factual correction, not something this spec needs to fix.

### 1.3 What this means architecturally

The Intelligence Workspace is not merely "an app to integrate with" — it is a
**live, working, simpler implementation of large parts of Parliament Core**
(agent registry, agent execution log) **and Grant Studio's Reporting/
Compliance Studios** (report generation against project data, a compliance
review agent), already in production, already generating real reports for
real projects. This changes the integration question from "how do we connect
to it" to "how much of Parliament Core's governed architecture do we layer on
top of, versus how much do we let this continue running as-is" — answered
definitively in §7 below.

## 2. Gaps Identified (factual, not a criticism — this was built as a fast MVP path)

### 2.1 No governance layer

`me-agent`, `compliance-agent`, and `reporting-agent` run once, synchronously,
and write directly to `reports` — no Workflow Engine, no Tripartite Veto
Engine, no Human Gate. A `compliance-agent` output goes straight into a
`reports` row as a narrative document; it is not a structured `Compliance
Finding` (Regulatory Knowledge Layer spec §5) with a cited rule, and nothing
requires a human to review it before it's considered final. This is a real
gap against EAS §7.2 (human oversight is structural) for anything donor-
facing. §7 below decides how this is resolved rather than leaving it open.

### 2.2 No multi-tenancy / Organisation concept

Every table scopes to `created_by = auth.uid()` (a single Supabase Auth user)
or, for `clients`, to "any authenticated user" with no scoping at all — two
different and inconsistent isolation models already present in one schema.
There is no `organisations` table. ADR-0005 (multi-tenancy from day one)
was written for the new platform schema without yet accounting for this —
resolved additively in §5.

### 2.3 No LLM Gateway or Prompt Registry actually wired

`prompt_modules` exists in the schema with `agent_id`/`content`/`version`
columns — exactly the shape of a minimal Prompt Registry — but no edge
function queries it. Prompts are hardcoded template literals inside each
`index.ts`. The model is called directly via the Anthropic SDK with no
gateway abstraction, and the model string `'claude-sonnet-4-6'` is duplicated
across three files rather than centrally configured — a version bump today
means four manual edits, not a config change.

### 2.4 `clients` semantics — decided

Given the user's role (Civil Society Senior Consultant) and that `projects`
already has its own free-text `donor` field separate from `client_id`, the
governing reading is: **`clients` are the CSOs this consultancy serves**, and
`projects` are the grant-funded engagements delivered for those clients,
funded by a separate `donor`. This is now the confirmed working definition
for every downstream spec that references `clients` — not because the schema
proves it beyond doubt, but because it is the only reading consistent with
how `donor` and `client_id` coexist as distinct columns, and no plausible
alternative reading was identified. If real usage later contradicts it
(e.g. a `clients` row turns out to represent a donor in practice), that is a
data-quality finding to correct via a normal migration, not a reason to
re-open this as an architectural question.

## 3. Reconciliation Against EAS Domain Model

| Intelligence Workspace table | EAS §4 entity | Fit |
|---|---|---|
| `projects` | `Project` (post-award) | Direct match, already richer than the placeholder EAS definition (has `budget_spent` vs. `budget_total` tracking the Database Schema spec's `projects` table doesn't yet have) |
| `activities`, `deliverables` | Ministry Task / Logframe activity | Close match to Logframe Studio's activity concept (Grant Studio §6) |
| `indicators` | `Logframe` indicator | Already matches the field list Grant Studio spec §6 calls for (baseline/target/actual/source of verification-adjacent `data_source`) |
| `risks` | Risk register (now a formal EAS entity — see below) | Was implicit in the historical roadmap's "Opposition & Compliance" cluster but never given a schema slot; `docs/11-Database-Schema/` treats it as the real, existing `risks` table extended, not a gap to fill fresh |
| `project_documents` | Knowledge Document (project-scoped) | Distinct from Regulatory Documents (Regulatory Knowledge Layer spec §2) — this is project-specific evidence/deliverables, correctly a separate concept |
| `reports` | `Report` (post-award narrative) | Direct match to Reporting Studio's output (Grant Studio §9); §7 decides how the mandatory-template compliance layer is added |
| `ai_agents` / `prompt_modules` / `agent_runs` | `Agent` / `AgentVersion` / `AgentInvocation` (Parliament Core spec §3.6) | Structurally close — see §6 for the reconciliation, now the confirmed physical implementation per ADR-0007 |
| `clients` | New EAS entity — client (CSO served) | Confirmed §2.4 |

## 4. Consortium Builder Post-Award Mandate (ADR-0001) — Confirmed

Grant Studio §4.2's post-award scope (subcontract/sub-grant oversight,
partner financial reporting, payment/transfer tracking, amendment
management, due-diligence refresh, performance rating) has no home in the
current Intelligence Workspace schema — there is no `Partner` table at all.
This is genuinely new surface area, additive by construction (new tables,
no existing table touched). The authoritative table definition is
`docs/11-Database-Schema/Database-Schema-Specification-v1.0.md` §5.2
(`partners`), which foreign-keys directly to this project's real `projects.
id` and `proposals.id` — this section no longer duplicates that DDL; treat
the Database Schema spec as the single source of truth for the table shape,
and this section as the business-rule context for why it exists.

## 5. Multi-Tenancy — Confirmed, Additive, Backward-Compatible

Full migration DDL is now in `docs/11-Database-Schema/Database-Schema-
Specification-v1.0.md` §1 (`organisations`, `organisation_members`, additive
`organisation_id` columns across every real tenant-scoped table, backfill,
dual RLS). This section confirms the business decision that DDL implements:

**Organisation boundary — decided:** at v1, one `Organisation` row
represents this consultancy as a whole; every `client` is a sub-entity
within that single tenant, not a tenant of its own. This is the simpler,
lower-risk default and matches how the product actually operates today (one
consultancy, many CSO clients, one Supabase project). The alternative — each
`client` eventually becoming its own tenant, relevant only if the platform
is later offered directly to other CSOs as a multi-org SaaS product (the
original chatgpt-audit's Phase 7 marketplace idea) — is explicitly **not**
built now. The schema supports it later without a breaking change: a
second, later migration would split `organisation_members` differently and
introduce a `client_id`-to-`organisation_id` promotion path, but nothing in
§1's current migration forecloses that option. Building it now would be
speculative complexity against EAS principle 5 (build for the workload that
exists, not the one that might exist).

This satisfies ADR-0005 (multi-tenancy from day one for the *new* platform
schema) without breaking the live product — existing single-user behaviour
keeps working exactly as it does today; the `organisation_id` column and its
RLS policy are additive and initially redundant with `created_by` for a
single-tenant deployment. A full cutover to organisation-scoped-only RLS
remains a separate, later decision, tracked as a follow-up item once a
second tenant is actually onboarded — not before.

## 6. Agent Runtime Reconciliation (Parliament Core spec §3) — Confirmed

Rather than building a parallel Agent Runtime and migrating away from
`ai_agents`/`prompt_modules`/`agent_runs`, these tables are **extended** to
match the Parliament Core contract (full DDL: `docs/11-Database-Schema/` §3):

| Parliament Core concept | Existing table | Extension |
|---|---|---|
| `Agent` | `ai_agents` | `allowed_tools text[]` |
| `AgentVersion` | `prompt_modules` | `model_provider`, `model_name`, `status` |
| `AgentInvocation` | `agent_runs` | `prompt_module_id` FK, `token_cost`, `latency_ms` |

Once extended, the edge functions are updated to (a) actually query
`prompt_modules` instead of hardcoding prompts — this is a data migration
(insert the four current hardcoded prompts as version-1 `prompt_modules`
rows, including registering `proposal-agent` in `ai_agents` for the first
time) plus a small code change per function to fetch-then-call instead of
inline-template-then-call, and (b) route the model call through a thin LLM
Gateway function rather than calling the Anthropic SDK inline. This closes
gap §2.3 without discarding the working `agent_runs` audit trail. The LLM
Gateway itself is a target contract (function signature: `invoke(agentSlug,
promptVariables) → {output, tokenCost, latencyMs}`, provider-agnostic) for
`docs/04-Platform-Services/` to formalise — not implementation code to write
here.

`proposal-agent`'s raw passthrough shape (§1.2) is the closest existing thing
to a generic LLM Gateway endpoint — it is the seed for that component
specifically, once given proper logging (an `ai_agents` row, `agent_runs`
logging it currently skips) and tool-permission enforcement (Parliament Core
spec §3.3), rather than something to discard.

## 7. Reporting & Compliance Studio Integration (Grant Studio §8-§9) — Governance Rollout Decided

**Decision: a dual-path model, not a single cutover.** Every one of the four
agents keeps its current fast, synchronous, ungoverned path for **internal
draft generation** — a human consultant always reads the output before using
it for anything external, and requiring a full Workflow Engine + Human Gate
round-trip for that use case would add latency and process overhead with no
corresponding risk reduction, since nothing produced this way reaches a
donor or partner without a human already in the loop by construction.

Governance (Workflow Engine + Human Gate + structured Compliance Finding
output) is required only at the point an artefact **becomes donor-facing or
partner-facing** — concretely:

1. `compliance-agent`'s narrative `reports` output stays as-is for internal
   use. When a compliance review is being prepared for a donor-facing audit
   response or a partner due-diligence file, it must also produce structured
   `compliance_findings` rows (Regulatory Knowledge Layer spec §5) — every
   claim traceable to a cited clause per the no-fabrication principle (EAS
   §2 principle 3) — gated on that specific use, not on every invocation.
2. `reporting-agent`'s output routes through a Human Gate (EAS §3.1's
   Submission Gate category) specifically at the point a report is marked
   `interim_narrative` or `final_narrative` (the `report_type` values added
   in `docs/11-Database-Schema/` §5.1) for actual donor submission — a
   `monthly_report` used purely for internal tracking does not require this
   gate. The `reports` row gains a `submission_status` field
   (`internal_draft` | `pending_human_review` | `approved_for_submission`)
   as the concrete mechanism distinguishing the two paths; this is an
   additive column on the real `reports` table, consistent with §5's
   additive-only pattern.

This resolves gap §2.1 as a deliberate, permanent policy — not a temporary
allowance pending a "someday" full governance rollout. Internal-fast-path
and donor-facing-governed-path are two first-class, intentional operating
modes of the same agents, distinguished by output destination, not by a
maturity timeline. Both changes are additive: nothing about how the four
existing edge functions work today needs to change for their current
internal-use pattern to keep working unmodified.

## 8. Resolved Decisions (formerly Open Items)

All four items originally listed here are now resolved:

- **ADR-0007** — Accepted. Single Supabase instance; this spec's §4-§7 are
  the confirmed Option A implementation, not a conditional draft.
- **`clients` semantics** (§2.4) — decided: CSOs this consultancy serves.
- **Organisation boundary** (§5) — decided: one Organisation for the whole
  consultancy at v1; per-client tenancy deferred, not built now.
- **Governance rollout** (§7) — decided: permanent dual-path model
  (ungoverned internal fast path + governed donor/partner-facing path),
  distinguished by a `submission_status` field, not a temporary bridge to a
  future full-governance cutover.

No open items remain in this spec. Any future change to these decisions
goes through a new ADR, per the standard governance workflow (top-level
`README.md`), not a silent edit here.
