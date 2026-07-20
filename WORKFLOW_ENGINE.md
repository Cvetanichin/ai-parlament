# WORKFLOW_ENGINE.md

## 1. What "the workflow engine" actually is

Not a separate service. It is the loop inside `orchestrate-task/index.ts` that reads `workflow_steps` for the resolved `workflow_id`, in `step_order`, and executes each one via `runPromptStep()`. There is no scheduler, no queue, no separate worker process in v1 — one HTTP request runs one workflow synchronously, start to finish. This is deliberate: it keeps v1 debuggable and matches the actual usage pattern (a consultant submits a task and waits for the result).

## 2. Step execution contract

```ts
async function runPromptStep(args: {
  stepName: string;
  module: PromptModule;          // full row from prompt_modules
  task: string;                  // accumulated task context
  context: Record<string, Json>; // prior step outputs + injected context assets
  expectJson: boolean;           // = module.strict_output_enabled
  globalControl: PromptModule;   // GLOBAL_CONTROL, always prepended
}): Promise<unknown>
```

Every step, regardless of role (`core`/`planner`/`specialist`/`validator`/`formatter`/`logger`), goes through this same function. Role-specific behaviour (e.g. a validator's semantic guards) is layered on top in `validation.ts`, not by forking this function.

## 3. State passed between steps

State accumulates in a single `context: Record<string, Json>` object keyed by each step's `output_key` (from `workflow_steps.output_key`). A later step reads only the keys it needs — the full accumulated object is available, but individual prompt inputs are built by `buildModelInput()` selecting relevant keys, not by dumping the entire state into every prompt (this would defeat the point of `CONTEXT_FILTER` — see §5 and `CONTEXT_SYSTEM.md`).

## 4. Execution patterns — implementation notes

`ARCHITECTURE.md` §3 defines the four patterns. Implementation notes:

- **`sequential_chain`** (all v1 workflows): iterate `workflow_steps` in `step_order`. If a `required = true` step fails validation, halt and return `status: "failed"`. If `required = false`, log and continue with that step's output omitted from downstream context.
- **`branch_and_merge`** (Phase 2, `OPTION_GENERATOR`): a single `workflow_steps` row with `step_role = 'specialist'` and `module_id = 'OPTION_GENERATOR'` internally requests N variants in one call (the module's prompt handles "generate 3 options"), rather than the engine looping 3 times — cheaper and keeps the options mutually aware of each other for comparison. Confirm this against `OPTION_GENERATOR`'s actual schema before implementing (`PROMPT_MODULES.md`).
- **`planner_plus_workers`** (Phase 2+): `TASK_PLANNER`'s `substeps` array (see its schema in `PROMPT_ENGINE.md`) drives a dynamic sub-loop — the only place in v1 where step execution isn't fully statically defined by `workflow_steps` alone. Each planner substep maps to a specialist call; results aggregate before the validator step. This is the one part of the engine that reads structure from an LLM output rather than purely from the DB — treat planner substep counts and types as untrusted until validated (`validatePlannerOutput` guard, `PROMPT_ENGINE.md` §7).

## 5. Routing decision flow

```
INTENT_CLASSIFIER (LLM, proposes)
        │
        ▼
resolve_workflow_for_run RPC (SQL, authoritative — evaluates routing_rules by priority)
        │
        ▼
WORKFLOW_ROUTER (LLM, explains/logs the decision, does not override the RPC)
```

Rationale for RPC-as-authority over LLM-as-authority: routing must be deterministic and auditable for a consulting practice where "why did the system choose this workflow" needs a real answer, not a probabilistic one. Full reasoning: `ADR/008-routing.md`.

## 6. v1 workflow packs (must ship — seed data in migration 002)

| Workflow ID | Chain | Execution pattern |
|---|---|---|
| `ME_FRAMEWORK` | `GLOBAL_CONTROL → INTAKE_NORMALIZER → INTENT_CLASSIFIER → WORKFLOW_ROUTER → TASK_PLANNER → SPECIALIST_ME_FRAMEWORK → VALIDATOR_INDICATORS → FORMATTER_TABLE_FIRST → RUN_LOGGER` | `sequential_chain` |
| `PRODUCT_MVP_DESIGN` | `GLOBAL_CONTROL → INTAKE_NORMALIZER → INTENT_CLASSIFIER → WORKFLOW_ROUTER → TASK_PLANNER → SPECIALIST_PRODUCT_MVP → VALIDATOR_MVP_REALISM → FORMATTER_TABLE_FIRST → RUN_LOGGER` | `sequential_chain` |
| `PROMPT_ENGINEERING` | `GLOBAL_CONTROL → INTAKE_NORMALIZER → INTENT_CLASSIFIER → WORKFLOW_ROUTER → TASK_PLANNER → SPECIALIST_PROMPT_ENGINEERING → VALIDATOR_GENERIC → FORMATTER_TABLE_FIRST → RUN_LOGGER` | `sequential_chain` |

`GRANT_CONCEPT` (using `SPECIALIST_GRANT_CONCEPT` and `FORMATTER_DONOR_READY`) is Phase 2 — those two modules aren't in the v1 set.

Note `CONTEXT_FILTER` is omitted from all three v1 chains — it's a Phase 2 module (`BUILD_SPEC.md` §1). Until then, context selection for v1 is a simplified fixed lookup in `context.ts` keyed by `project_id`, not the full filtering logic — see `CONTEXT_SYSTEM.md` §4.
