# ADR-005: Workflow Engine Reads Structure from the Database, Not Code

**Status:** Accepted

## Context

A workflow's step sequence could be expressed as a TypeScript switch/pipeline per workflow, or as data rows the engine iterates generically.

## Decision

`workflow_steps` rows (ordered by `step_order`) fully define a workflow's sequence. `orchestrate-task/index.ts` contains one generic loop (`runPromptStep` per row), not one code path per workflow. The one exception is `TASK_PLANNER`'s dynamic substeps under `planner_plus_workers`, which are necessarily data the engine reads from an LLM response rather than from `workflow_steps` directly — see `WORKFLOW_ENGINE.md` §4.

## Consequences

- Positive: adding workflow #5 is a data operation (insert rows), not a code change — directly required by Golden Rule 6/7 (`PROJECT.md`).
- Negative: the generic loop must handle four different execution patterns (`ARCHITECTURE.md` §3) with reasonably different needs, which adds some conditional complexity inside one function rather than four small dedicated ones. Judged acceptable given the replaceability requirement is non-negotiable.

## Alternatives considered

- **One TypeScript function per workflow.** Rejected — violates Golden Rule 6 directly; every new workflow would need a code deploy.
