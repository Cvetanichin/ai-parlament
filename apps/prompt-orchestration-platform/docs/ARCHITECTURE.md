# ARCHITECTURE.md

## 1. Layer diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Client (React + Tailwind)                                   │
│  Submits user_input, displays final_output                   │
└───────────────────────────┬────────────────────────────────┘
                             │ POST /orchestrate-task
┌───────────────────────────▼────────────────────────────────┐
│  Edge Function: orchestrate-task (Deno/TypeScript)            │
│  Orchestrates only. No business rules. See EDGE_FUNCTIONS.md  │
└───────────────────────────┬────────────────────────────────┘
                             │ reads/writes
┌───────────────────────────▼────────────────────────────────┐
│  Workflow Engine (in-function, driven entirely by DB rows)     │
│  Resolves workflow → iterates workflow_steps → runs each step │
└───────────────────────────┬────────────────────────────────┘
                             │ per step
┌───────────────────────────▼────────────────────────────────┐
│  Prompt Modules (database rows, prompt_modules table)          │
│  GLOBAL_CONTROL → INTAKE_NORMALIZER → INTENT_CLASSIFIER →      │
│  WORKFLOW_ROUTER → CONTEXT_FILTER → TASK_PLANNER →              │
│  SPECIALIST_* → VALIDATOR_* → FORMATTER_* → RUN_LOGGER          │
└───────────────────────────┬────────────────────────────────┘
                             │ each step output validated
┌───────────────────────────▼────────────────────────────────┐
│  Validator (schema + semantic guards, PROMPT_ENGINE.md §6)      │
└───────────────────────────┬────────────────────────────────┘
                             │
┌───────────────────────────▼────────────────────────────────┐
│  Formatter (shapes final_output for the requested delivery)     │
└───────────────────────────┬────────────────────────────────┘
                             │
┌───────────────────────────▼────────────────────────────────┐
│  Run Logger → task_runs / run_steps (Postgres)                  │
└─────────────────────────────────────────────────────────────┘
```

## 2. Design principle

The database is the application. Code is a thin, replaceable execution shell around data that defines behaviour. This is why: prompts change weekly as consulting practice evolves; code should not need to change at the same cadence. A consultant editing a prompt in a future admin UI must never require a deploy.

## 3. Execution patterns (choose per workflow, set on `workflows.execution_pattern`)

| Pattern | When | Flow |
|---|---|---|
| `direct_response` | Simple single-step task | classify → choose role → run one prompt → light validation → return |
| `sequential_chain` | Ordered reasoning required | fixed step sequence, each step's output feeds the next |
| `branch_and_merge` | Comparison / multi-option task | generate N options (`OPTION_GENERATOR`) → compare → recommend |
| `planner_plus_workers` | Complex multi-part deliverable | `TASK_PLANNER` decomposes → specialist(s) execute sub-tasks → aggregate → validate → format |

v1 workflows (`ME_FRAMEWORK`, `PRODUCT_MVP_DESIGN`, `PROMPT_ENGINEERING`, `GRANT_CONCEPT`) all use `sequential_chain`. `planner_plus_workers` and `branch_and_merge` are architecturally supported from day one (the schema doesn't change) but not exercised until a workflow actually needs them — do not force early workflows into a more complex pattern than they need.

## 4. Why this isn't over-engineered

A reasonable objection: this is a lot of infrastructure for 12 prompts. The counter-argument, and the reason it's still the right call: the prompt library this replaces already has 22 modules and 4+ workflow packs documented and in active informal use (`04_PromptLibrary_SystemPromptsStructure.md`). The alternative to this architecture is not "less architecture" — it's the same complexity, ungoverned, inside a ChatGPT chat history. This system makes existing complexity auditable, versionable, and reusable across the consultancy rather than trapped in one person's prompt habits.

## 5. What this architecture explicitly defers

- Multi-agent autonomous execution (ADR-015) — v1 is human-initiated, single-run-at-a-time.
- Vector search / long-term memory beyond `context_assets` — no embeddings table in v1.
- Multi-provider model routing — OpenAI only (ADR-010).
- Public multi-tenancy — see `SECURITY_MODEL.md` for what this implies about RLS.
