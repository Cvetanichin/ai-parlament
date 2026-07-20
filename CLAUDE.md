# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

Two things live here, and they are not the same thing:

1. **`docs/` + `00-EAS-v1.0.md`** — the full governance/architecture spec set for a platform
   currently branded (from top to bottom) **Cvetanichin → CSO Playground OS → Quorum Engine
   (governance) / Grant Studio (pre-award) / Project Operations (post-award) / Knowledge Hub
   (knowledge platform) / House of Parliament (dev environment)**. Read order and current
   approval status are tracked in the root `README.md`, not here — check it before assuming a
   spec is authoritative.
2. **`supabase/`** — the actual implementation: SQL migrations plus Deno Edge Functions. This is
   the only runnable code in the repo. There is no frontend and no `package.json` anywhere — do
   not assume a Node/npm toolchain.

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

# Re-apply all migrations from scratch against the local DB
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

# Lint (matches .github/workflows/deno.yml)
deno lint

# Tests — none exist yet (see docs/18-Testing/ for the planned test pyramid);
# `deno test -A` once *_test.ts / *.test.ts files exist
deno test -A
```

There is no build step — Edge Functions are plain Deno/TypeScript, bundled and type-checked by
Supabase at `deploy`/`serve` time (a broken import or type error fails outright, not silently).

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
  (`requireGateRole`, EAS §9 Liability NFR).

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

| Function | Purpose |
|---|---|
| `workflow-research-run` | Runs the Research Ministry's Go/No-Go Risk Matrix, transitions to `awaiting_human` |
| `workflow-governance-run` | Writing → Veto → Vote of No Confidence loop |
| `workflow-gate-decide` | Human Gate decision (owner/admin only); three gate types, override enforcement |
| `eligibility-report-run` | Runs the Eligibility Engine for an Opportunity |
| `eligibility-report-get` | Reads the latest `eligibility_reports` row |
| `embedding-pipeline-run` | Chunk-embed pipeline across the fixed `SOURCE_TABLES` allowlist (ADR-0010) |

`_shared/ministries/{research,writing}.ts` are ported near-verbatim from the real MVP
(`researchMinistry.js`/`writingMinistry.js`); the other 7 of the platform's 9 v1 ministries are
net-new, built to the same Ministry Adapter contract, not re-platformed from anything.

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

One additive migration sequence (numbered `01`–`15` in filenames) against the real, live
Supabase project's original schema — not a fresh schema for a separate instance (ADR-0007). Full
consolidated schema reference lives in `docs/11-Database-Schema/` (currently v1.5); treat that doc,
not the migrations directory alone, as the source of truth for table shapes and constraints, since
several columns/constraints have real CHECK values narrower than a spec's illustrative example
(see the Eligibility Engine note above for one concrete instance of this).

### Local config notes (`supabase/config.toml`)

- API on `54321`, DB on `54322`, Studio via the default local URL supabase prints on `start`.
- `[edge_runtime] policy = "per_worker"` — hot reload is on for local dev; switch to `oneshot` only
  if hot reload misbehaves.
- `deno_version = 2`.
