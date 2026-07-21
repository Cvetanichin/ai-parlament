# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

Three things live here, and they are not the same thing:

1. **`docs/` + `00-EAS-v1.0.md`** — the full governance/architecture spec set for a platform
   currently branded (from top to bottom) **Cvetanichin → CSO Playground OS → Quorum Engine
   (governance) / Grant Studio (pre-award) / Project Operations (post-award) / Knowledge Hub
   (knowledge platform) / House of Parliament (dev environment)**. Read order and current
   approval status are tracked in the root `README.md`, not here — check it before assuming a
   spec is authoritative.
2. **`supabase/`** — the backend implementation: SQL migrations plus Deno Edge Functions.
3. **`frontend/`** — a Vite/React/TypeScript shell (real `package.json`, real Node/npm toolchain —
   `npm run dev`/`npm run build` from inside `frontend/`). One authenticated shell app, not four
   separate deployments (`docs/13-Frontend/` §1): Grant Studio, Project Operations, Knowledge Hub,
   and Executive Dashboard (`docs/13-` §5 — pipeline status, deadlines, cost via `cost_rollups`,
   aggregated `compliance_findings` via `getOrganisationComplianceOverview`,
   `complianceStudio.ts`) all have real routes. House of Parliament is deliberately excluded from
   this shell — it stays the separate
   `frontend/index.html` MVP playground (`docs/13-` §0/§8), a different application with different
   users. See `frontend/src/app/lib/edgeFunctions.ts`'s header comment for the data-fetching rule
   (direct Supabase reads when RLS alone gates it, Edge Function calls when a workflow/gate/rule
   beyond RLS is involved) and `supabase/TEST_ACCOUNTS.txt` for local login credentials.

**The governance rule that matters most:** implement only what a spec in `docs/` marks
`Approved`. If a spec is ambiguous, silent, or still `Draft`, the correct move is to ask or raise
an ADR (`docs/21-ADRs/`), not to invent behaviour. Every schema change to a real, live table goes
through a staging Supabase project first (ADR-0007) before promotion to production — never write
a migration that's meant to go straight to production.

## Commands

All commands run from the repo root using the Supabase CLI (already installed; Docker Desktop is
required for the local stack).

```bash
# Start the local stack (Postgres, Auth, Storage, Studio) — applies all
# supabase/migrations/*.sql on first run / on `db reset`. No cloud account needed.
supabase start

# Re-apply all migrations from scratch against the local DB, then apply
# supabase/seed.sql (local-dev-only dummy data — see that file's own header
# comment for the login accounts it creates and, importantly, what it
# deliberately does NOT seed: regulatory_documents/regulatory_clauses/
# compliance_findings stay empty here always — every compliance verdict in
# this codebase must trace to a real cited rule, never fabricated text;
# don't add seed rows to those three tables under any circumstance short of
# real PRAG/Annex source text run through regulatory-document-ingest-run).
supabase db reset

# Serve all Edge Functions locally with hot reload (per_worker policy, config.toml).
# SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
# Optional secrets (ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, GOVERNANCE_MODE) come
# from supabase/.env.local — copy supabase/.env.example and fill in as needed. With no LLM key
# set, llmGateway.ts transparently falls back to a mock provider — the whole governance loop is
# demoable with zero external dependencies or cost.
supabase functions serve --env-file supabase/.env.local

# Serve a single function
supabase functions serve workflow-research-run --env-file supabase/.env.local

# Stop the local stack
supabase stop

# Frontend dev server / production build (from inside frontend/)
npm run dev
npm run build   # tsc -b && vite build

# Lint (matches .github/workflows/deno.yml)
deno lint

# Tests exist now (docs/18-Testing/'s top 3 priority tiers — deterministic
# validators, Veto Engine golden files, Workflow Engine gate-sequencing;
# co-located *_shared/*_test.ts files, e.g. vetoEngine_test.ts). Requires an
# actual Deno install; supabase's bundled edge-runtime binary is NOT a
# general-purpose deno CLI and cannot run this. If no deno is on PATH
# (true in some sandboxed dev environments), run it in a throwaway
# container instead: `docker run --rm -v "$(pwd)/supabase/functions:/work"
# -w /work denoland/deno:latest deno test -A` — but verify the bind mount
# actually populated (`docker run ... ls /work`) before trusting the
# result: a sandboxed shell's view of a host path can silently fail to
# resolve for `-v`/`docker cp` alike; `docker cp` per-file into an
# already-running container is the fallback that reliably works.
deno test -A
```

Edge Functions have no separate build step — plain Deno/TypeScript, bundled and type-checked by
Supabase at `deploy`/`serve` time (a broken import or type error fails outright, not silently).
The frontend does have a real build step (`tsc -b && vite build`, standard Vite/React).

## Architecture

### Layering (maps directly to EAS §2–§4)

- **Layer 4 — LLM Gateway** (`_shared/llmGateway.ts`): the *only* caller of a model SDK. Every
  Agent invocation goes through `generateText()`. Provider is chosen by `ai_agents` /
  `prompt_modules.model_provider` (`anthropic` default, `gemini` second adapter, `mock` when no
  key is configured or the real call fails) — ministry code never calls a provider directly.
- **Layer 3 — Agent Runtime** (`_shared/agentRuntime.ts`): owns *execution*. `invokeAgent()` looks
  up the Agent (`ai_agents`) and its active AgentVersion (`prompt_modules`, exactly one
  `status='active'` row per agent), builds the prompt, calls the LLM Gateway, and always writes an
  `agent_runs` row — this is what makes every invocation auditable by construction (EAS
  principle 8). `agent_runs.project_id` is `NOT NULL` on the real table, so every caller must
  supply a real `projectId`.
- **Layer 3 — Workflow Engine** (`_shared/workflowEngine.ts`): owns *sequencing* — the
  `workflow_instances` state machine, the Vote of No Confidence sub-workflow, and the three Human
  Gates. Ported from the real MVP's `pmAgent.js`/`humanGates.js` (confirmed against actual source,
  not just its README — see `docs/03-Parliament-Core/` §0).
- **Opposition & Compliance — Tripartite Veto Engine** (`_shared/vetoEngine.ts`): three
  independent checks on a draft — `deterministic` (length/emptiness, plain code),
  `lexical` (required-keyword matching, plain code), `semantic` (an LLM judge, but run as its own
  registered Agent, `compliance_judge`, with its own `agent_runs` row — deliberately not a bare
  LLM Gateway call, so it doesn't bypass the audit trail). **Any** failure vetoes the draft.
- **Auth** (`_shared/auth.ts`): Edge Functions run with `verify_jwt=true` at the platform level;
  `resolveCaller()` additionally resolves *which organisation* the caller belongs to and their
  role, because functions use the service-role client for multi-table writes and so cannot rely on
  RLS alone. Has a `service_role` fast path for system-initiated calls (e.g. Postgres
  trigger/pg_net, ADR-0009 §4 Phase C.3) that resolves a synthetic `role: "system"` — deliberately
  never `owner`/`admin`, so an automated caller can never reach a Human Gate decision
  (`requireGateRole`, EAS §9 Liability NFR). `resolvePlatformOperator()` is the separate,
  no-project-dependency identity path for `profiles.is_platform_operator = true` callers (House of
  Parliament, GDPR erasure, regulatory document ingestion) — it additionally enforces MFA
  (`aal2` in the JWT), never just checks the flag.
- **Context Engine** (`_shared/contextEngine.ts`, Platform Services spec §1): stateless — "has no
  storage of its own." `assembleContext()` pulls tier-filtered `memory_entries` into a preamble
  layered onto a Ministry's own prompt. Wired into `invokeAgent()` as an **opt-in** `contextEngine`
  param — omitted, behaviour is byte-for-byte unchanged (the 8 ministries built before this existed
  don't pass it); the 3 built alongside it (Fundraising, Finance & Administration, Procurement) do.
- **Event Bus** (`_shared/eventBus.ts` → `platform_events`, Platform Services spec §2): `publishEvent()`
  is wired at three call sites only — `workflow-gate-decide`, a veto failure in
  `workflowEngine.ts`'s governance loop, `submission-package-submit` — not every write path; treat
  this as the pattern to extend, not a claim that every event type is already published.
- **Notification Engine** (`notification-dispatch-run`, `notification-channel-upsert-run`):
  delivery is mocked exactly like `llmGateway.ts` mocks an LLM call absent a provider key — a
  configured channel secret gets a real webhook POST, an unconfigured one logs `sent` with a
  `(mock)`-prefixed note. Channel secrets live in **Supabase Vault**, never the plain
  `notification_channels.config` column — `notification_channel_set_secret`/`_get_secret`
  (migration 22) are the only read/write path, both `service_role`-only SECURITY DEFINER functions.
- **GDPR erasure** (`gdpr-erasure-run`, Security spec §7): platform-operator-only, two request
  types — `user_account` (hard-delete `organisation_members`/`profiles`/`auth.users`, anonymize
  every real author-tracking column that actually exists in this schema — `projects.created_by`,
  `clients.created_by`, `prompt_modules.author_id` — and `audit_events.actor_id`, never delete the
  audit row) and `beneficiary_source_documents` (hard-delete named `knowledge_documents` rows).
  Audit-log immutability always wins via anonymization, never row deletion — a platform-wide rule,
  not a per-table judgment call.
- **AI App Register** (`ai-app-register-upsert-run`, AI Governance spec §2): owner/admin,
  organisation-scoped entries only — the 5 platform-wide template rows (`organisation_id IS NULL`,
  seeded in migration 20) are not editable through this endpoint on purpose.
- **Regulatory Knowledge Layer ingestion** (`_shared/regulatoryIngestion.ts` →
  `regulatory-document-ingest-run`): parser/chunker/deterministic-obligation-classifier, all pure
  transforms of caller-supplied text — never generates rule content. **`regulatory_clauses` and
  `compliance_findings` are real, live, empty tables on purpose** — no real PRAG/Annex/Standard
  Grant Contract source text exists anywhere in this repo (confirmed absent, not merely unfound).
  Every downstream validator (`eligibilityEngine.ts`, `budgetEngine.ts`, `complianceStudio.ts`,
  Compliance Studio's rollups) correctly returns `context_dependent` rather than a fabricated pass
  until real source text is ingested. **Do not seed, mock, or hardcode plausible-sounding
  regulatory rule text anywhere in this codebase** — this is the one line this project holds hardest.

### The governance state machine (Parliament Core)

`workflow_instances.state` transitions (see `workflowEngine.ts` for the authoritative sequence):

```
pending/running → (research) → awaiting_human [Go/No-Go gate]
  → running → (writing → veto) → veto_failed → rewriting → ... (up to threshold)
  → awaiting_human [Polish gate] → awaiting_human [Submission gate] → completed
                                                                     ↘ failed (on any rejection)
```

- **Vote of No Confidence**: on veto failure, a forced context reset (no prior draft carried
  forward — only the structured error log) plus a rewrite, capped at
  `voteOfNoConfidenceThreshold` (per-Workflow-Definition, default 2, ADR-0003). Exhausting it
  escalates to a human rather than failing silently.
- **Confidence heuristic**: `high` if veto passed on attempt 1, `medium` if it passed after a
  Vote of No Confidence cycle, `low` if it never passed within the threshold.
- **Gate sequencing is enforced**, not just documented: `decideGate()` derives the expected next
  gate from the most recent relevant `audit_events` row (not a new column) and refuses an
  out-of-order `gateType` with `409 gate_precondition_unmet`. Submission is the only gate that
  reaches `completed` — no fully autonomous submission path exists anywhere (EAS §9).
- **Compliance Override**: approving a gate against a flagged risk (Vote of No Confidence
  escalation at Polish, a NO-GO recommendation at Go/No-Go, or any prior override at Submission —
  overrides don't "get used up") requires a non-empty `overrideJustification`, logged in the
  `gate_decision` audit event. This is derived from existing `audit_events`/history rows, not new
  schema — a recurring pattern in this codebase: prefer reading existing data over adding columns.
- `GOVERNANCE_MODE` (`shadow` default / `enforced`) is read per-function but, as of ADR-0009
  Phase C.2/C.3, nothing branches on it yet in the live ministries — it's wired for a future
  cutover (Phase C.6), not active enforcement today.

### Edge Functions (`supabase/functions/`)

45+ functions now — this table is representative, not exhaustive; `ls supabase/functions` for the
full list. Grouped by what they own:

| Function (representative) | Purpose |
|---|---|
| `workflow-research-run` | Runs the Research Ministry's Go/No-Go Risk Matrix, transitions to `awaiting_human` |
| `workflow-governance-run` | Writing → Veto → Vote of No Confidence loop |
| `workflow-gate-decide` | Human Gate decision (owner/admin only); three gate types, override enforcement |
| `eligibility-report-run` / `-get` | Eligibility Engine for an Opportunity |
| `embedding-pipeline-run` | Chunk-embed pipeline across the fixed `SOURCE_TABLES` allowlist (ADR-0010) |
| `opportunity-ingest-run` | Opportunity Intelligence ingestion — a structured-payload upsert endpoint, deliberately **not** a live web crawler (Grant Studio §2, ADR-0002); drafts `strategic_narrative`/scores via the Fundraising ministry |
| `budget-narrative-draft-run` | Finance & Administration ministry — drafts the Budget Studio narrative a human refines; validation stays in the separate, deterministic `budgetEngine.ts`/`budget-validate-run` |
| `procurement-decision-draft-run` | Procurement ministry — drafts a subcontract/vendor-selection rationale for human review, never writes `partners` itself |
| `regulatory-document-ingest-run` | Regulatory Knowledge Layer ingestion — platform-operator-only; see the anti-fabrication note above |
| `notification-dispatch-run` / `notification-channel-upsert-run` | Notification Engine + Vault-backed channel secrets |
| `gdpr-erasure-run` | GDPR right-to-erasure, both request types (see above) |
| `ai-app-register-upsert-run` | AI App Register, organisation-scoped entries |
| `me-agent` / `compliance-agent` / `reporting-agent` | M&E / Compliance / Reporting ministries — internal fast path, ungoverned, no Workflow Instance |
| `report-validate-run` / `report-submission-decide` / `report-lessons-learned` | Donor-facing report validation, the Report Submission Human Gate, and the Knowledge Platform learning-loop close |
| `proposal-*`, `submission-package-*`, `partner-*` | Rest of Grant Studio (Proposal Builder, Submission Gateway, Consortium Builder pre/post-award) |

**Ministry Library status: 8 of the 9 v1 ministries have real code.** `_shared/ministries/
{research,writing}.ts` are ported near-verbatim from the real MVP (`researchMinistry.js`/
`writingMinistry.js`); M&E/Compliance/Reporting live in `projectIntelligence.ts`; Fundraising/
Finance & Administration/Procurement (`fundraising.ts`/`financeAdministration.ts`/`procurement.ts`)
are net-new, built to the same Ministry Adapter contract. **Development is deliberately not
implemented** — no concrete data contract exists for it anywhere in the spec set (checked); ADR-0011
(`docs/21-ADRs/`) proposes one, not yet approved. Don't invent one — extend ADR-0011 or ask.

### Eligibility Engine (`_shared/eligibilityEngine.ts`)

Deliberately **not** an LLM Agent Invocation — every finding must be a real, cited rule object
(`rule`/`source`/`severity`/`status`), never LLM-freeform text asserting a rule exists (Grant
Studio §3). `compliance_findings.status` allows `pass|warning|fail|context_dependent|needs_review`,
but `eligibility_reports.*_status` only allows `pass|warning|fail` — `context_dependent` maps to
`"warning"` at that write boundary, with the fuller distinction preserved in `risk_flags` (text[])
and `audit_events.detail` (jsonb) so nothing is silently lost.

### Embedding pipeline (`_shared/embeddingClient.ts`, `_shared/embeddingSources.ts`)

`SOURCE_TABLES` is a fixed, in-code allowlist (`regulatory_clauses`, `knowledge_chunks`,
`knowledge_documents`, `opportunities`, `memory_entries`) mapping source table → text field —
intentionally not caller-supplied, so a bad `source_table` can't embed the wrong column. Adding a
new embedding-bearing table means updating this map, the RPC allowlist in migration
`13_embedding_pipeline_support.sql`, and ADR-0010 §7 together.

### Database (`supabase/migrations/`)

One additive migration sequence (numbered `01`–`22` in filenames, growing) against the real, live
Supabase project's original schema — not a fresh schema for a separate instance (ADR-0007).
`docs/11-Database-Schema/`'s own spec text (currently v1.5) has **not** been kept in sync with
migrations past `10_performance_hardening` — known, flagged drift, not something later migrations
silently introduced. Full consolidated schema reference lives there anyway; treat that doc,
not the migrations directory alone, as the source of truth for table shapes and constraints, since
several columns/constraints have real CHECK values narrower than a spec's illustrative example
(see the Eligibility Engine note above for one concrete instance of this).

### Local config notes (`supabase/config.toml`)

- API on `54321`, DB on `54322`, Studio via the default local URL supabase prints on `start`.
- `[edge_runtime] policy = "per_worker"` — hot reload is on for local dev; switch to `oneshot` only
  if hot reload misbehaves.
- `deno_version = 2`.
