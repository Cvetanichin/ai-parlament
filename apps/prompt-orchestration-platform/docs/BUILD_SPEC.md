# BUILD_SPEC.md

**Master implementation specification. This is the single source of truth for what to build. Where any other document conflicts with this one, BUILD_SPEC.md wins unless a newer ADR supersedes it — ADRs always win over docs.**

> **Superseded in part by `docs/21-ADRs/0011-prompt-orchestration-platform-as-parliament-core-extension.md` (repo root `docs/`, EAS's ADR series).** §2's standalone `supabase/functions/orchestrate-task/` and §3's fresh 11-table schema are not being built as written — this system is now an extension of EAS's Parliament Core, running in the `cso-playground` Supabase project and reusing its Workflow Engine/Agent Runtime instead of a bespoke control plane. The module registry, prompt contracts (§5), and validation design below remain the reference for *what* each specialist/validator/formatter does — read ADR-0011 first for *how* it's actually wired.

---

## 1. Scope of v1

Build the minimum viable orchestration set identified in the source prompt-library analysis — 12 of the 22 registered modules, wired end-to-end with strict Structured Outputs on the control plane, backed by a Postgres schema that treats modules, schemas, and workflows as data, not code.

**v1 module set (must ship):**
`GLOBAL_CONTROL`, `INTAKE_NORMALIZER`, `INTENT_CLASSIFIER`, `WORKFLOW_ROUTER`, `TASK_PLANNER`, `SPECIALIST_ME_FRAMEWORK`, `SPECIALIST_PRODUCT_MVP`, `SPECIALIST_PROMPT_ENGINEERING`, `VALIDATOR_GENERIC`, `VALIDATOR_INDICATORS`, `VALIDATOR_MVP_REALISM`, `FORMATTER_TABLE_FIRST`, `RUN_LOGGER`.

**v1.1 additions (Phase 2):** `CONTEXT_FILTER`, `SPECIALIST_NGO_PROJECT_DESIGN`, `SPECIALIST_GRANT_CONCEPT`, `SPECIALIST_ADVOCACY_STRATEGY`, `SPECIALIST_RESEARCH_SYNTHESIS`, `VALIDATOR_GENERIC` refinements, `FORMATTER_DONOR_READY`, `FORMATTER_JSON`, `OPTION_GENERATOR` (branch-and-merge).

Full registry and rationale: `PROMPT_MODULES.md`.

---

## 2. Repository Structure (target state)

```
repo-root/
├── docs/                              ← this documentation set
│   ├── PROJECT.md
│   ├── BUILD_SPEC.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── RPC_REFERENCE.md
│   ├── EDGE_FUNCTIONS.md
│   ├── WORKFLOW_ENGINE.md
│   ├── PROMPT_MODULES.md
│   ├── PROMPT_ENGINE.md
│   ├── CONTEXT_SYSTEM.md
│   ├── OUTPUT_FORMATS.md
│   ├── VERSIONING.md
│   ├── CODING_STANDARDS.md
│   ├── ERROR_HANDLING.md
│   ├── TESTING_STRATEGY.md
│   ├── SECURITY_MODEL.md
│   ├── DEPLOYMENT.md
│   ├── IMPLEMENTATION_PLAN.md
│   └── ADR/
│       ├── 001-system-architecture.md
│       ├── 002-database-design.md
│       ├── 003-rpc-layer.md
│       ├── 004-edge-functions.md
│       ├── 005-workflow-engine.md
│       ├── 006-prompt-modules.md
│       ├── 007-context-assets.md
│       ├── 008-routing.md
│       ├── 009-validation.md
│       ├── 010-openai-integration.md
│       ├── 011-security.md
│       ├── 012-observability.md
│       ├── 013-versioning.md
│       ├── 014-testing.md
│       └── 015-future-multi-agent.md
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_init_schema.sql
│   │   ├── 002_seed_core_modules.sql
│   │   ├── 003_add_strict_output_schema.sql
│   │   └── 00N_*.sql                  ← sequential, one concern per migration
│   ├── functions/
│   │   └── orchestrate-task/
│   │       ├── index.ts               ← entry point, HTTP handling only
│   │       ├── types.ts               ← shared types (Json, PromptModule, WorkflowStep, etc.)
│   │       ├── schemas.ts             ← STEP_SCHEMAS fallback registry (bootstrap only, see ADR-006)
│   │       ├── openai.ts              ← callOpenAIResponses wrapper
│   │       ├── routing.ts             ← workflow resolution (reads DB, no hardcoded rules)
│   │       ├── context.ts             ← context selection/injection
│   │       ├── validation.ts          ← semantic guards (Layer 3, see PROMPT_ENGINE.md §6)
│   │       ├── helpers.ts             ← buildModelInput, safeParseJson, etc.
│   │       └── logger.ts              ← RUN_LOGGER integration
│   └── tests/
│       └── orchestrator.test.ts
│
├── frontend/                          ← React + Tailwind app (Phase 3)
│
└── README.md
```

**Repo state note:** partial implementation already exists. Claude Code's first task (`IMPLEMENTATION_PLAN.md` Phase 0) is to audit the current repo against this structure and produce a written reconciliation report — not to assume a blank slate and not to assume the existing code is correct. Discrepancies get resolved task-by-task, not in one sweeping rewrite.

---

## 3. Database Contract (summary)

11 core tables. Full DDL, field types, and relationships: `DATABASE.md`.

`prompt_modules` · `workflows` · `workflow_steps` · `context_assets` · `routing_rules` · `output_formats` · `validators` · `projects` · `users` · `task_runs` · `run_steps`

Plus one governance column added in migration `003`:
```sql
alter table prompt_modules
  add column if not exists strict_output_enabled boolean not null default false;
```

---

## 4. Edge Function Contract (summary)

Single entry point: `POST /orchestrate-task`. Full request/response contract: `EDGE_FUNCTIONS.md`.

```
Request:  { user_input: string, project_id?: string, user_id?: string, output_format_hint?: string }
Response: { run_id: string, status: "completed"|"failed"|"needs_review", final_output: string|object, quality_assessment: string, steps: RunStepSummary[] }
```

Internally the function calls `runPromptStep()` once per workflow step, in the order defined by `workflow_steps.step_order` for the workflow selected by `WORKFLOW_ROUTER`. Each step:
1. Loads the module row (`prompt_modules`) by `module_id`.
2. Builds input from global control + prior step outputs + selected context (`context.ts`).
3. Calls OpenAI Responses API with `schemaConfig` from `module.output_schema_json` if `strict_output_enabled = true`, else `STEP_SCHEMAS[module_key]` as fallback, else no schema.
4. Parses and validates the result (three-layer validation, `PROMPT_ENGINE.md` §6).
5. Persists a `run_steps` row.
6. Passes the parsed output forward as context for the next step.

---

## 5. Prompt Module Contract

Every row in `prompt_modules` must satisfy:

| Field | Required | Notes |
|---|---|---|
| `module_id` | yes | Stable key, e.g. `INTAKE_NORMALIZER`. Never reused across different prompts. |
| `name` | yes | Human-readable |
| `category` | yes | `core` \| `specialist` \| `validator` \| `formatter` \| `utility` |
| `domain` | yes (may be empty array for `core`) | See `PROMPT_MODULES.md` domain enum |
| `prompt_text` | yes | The actual system/task prompt. Authoritative. |
| `input_schema_json` | no | Null permitted for prose-only inputs |
| `output_schema_json` | yes if `strict_output_enabled = true` | Named JSON Schema, `strict: true` |
| `default_output_type` | yes | `text` \| `table` \| `json` \| `memo` \| `doc_ready` \| `spec` |
| `version` | yes | Semantic-ish string, e.g. `v1`, `v1.1` — see `VERSIONING.md` |
| `status` | yes | `draft` \| `active` \| `deprecated` |
| `strict_output_enabled` | yes | Governs schema enforcement — see `PROMPT_ENGINE.md` §1 |

A module is not "done" until it has a row satisfying this table AND a passing test in `orchestrator.test.ts` that exercises it against its schema.

---

## 6. Acceptance Criteria Per Phase

See `IMPLEMENTATION_PLAN.md` for the full phased checklist. Phase-level acceptance gates:

- **Phase 0 (Reconciliation):** written gap report comparing current repo to this spec; no code changes yet.
- **Phase 1 (Control plane):** `INTAKE_NORMALIZER` → `INTENT_CLASSIFIER` → `WORKFLOW_ROUTER` → `TASK_PLANNER` run end-to-end against a live Supabase project, each returning strict-schema-validated output, each with a passing unit test.
- **Phase 2 (v1 specialists + validators + formatter):** the three v1 specialists, three v1 validators, and `FORMATTER_TABLE_FIRST` are wired; `ME_FRAMEWORK`, `PRODUCT_MVP_DESIGN`, and `PROMPT_ENGINEERING` workflows run end-to-end and produce a formatted, logged output for a realistic test input each.
- **Phase 3 (Frontend + remaining modules):** internal React UI can submit a task and display `final_output`; v1.1 modules shipped.
- **Phase 4 (Hardening):** security review passed (`SECURITY_MODEL.md`), test coverage targets met (`TESTING_STRATEGY.md`), deployment runbook exercised (`DEPLOYMENT.md`).

No phase starts until the prior phase's acceptance gate is met and confirmed by the project owner — not inferred by Claude Code.
