# EDGE_FUNCTIONS.md

## `orchestrate-task` (the only v1 Edge Function)

**Endpoint:** `POST /functions/v1/orchestrate-task`

### Request

```ts
{
  user_input: string;               // required
  project_id?: string;              // optional, FK to projects
  user_id?: string;                 // optional, FK to users (auth.users)
  output_format_hint?: string;      // optional, e.g. "table", "donor_ready"
}
```

### Response (success)

```ts
{
  run_id: string;
  status: "completed" | "needs_review";
  final_output: string | Record<string, unknown>;
  quality_assessment: "strong" | "acceptable_with_revisions" | "weak";
  steps: Array<{
    step_name: string;
    module_id: string;
    status: "completed" | "failed" | "skipped";
    duration_ms: number;
  }>;
}
```

### Response (failure)

```ts
{
  run_id: string;
  status: "failed";
  error: { code: string; message: string; step_name?: string };
}
```

Error codes: see `ERROR_HANDLING.md` §2 for the full taxonomy (`SCHEMA_VALIDATION_FAILED`, `SEMANTIC_VALIDATION_FAILED`, `ROUTING_MISMATCH`, `OPENAI_API_ERROR`, `MODULE_NOT_FOUND`, `WORKFLOW_NOT_FOUND`).

### Internal execution order

1. `create_task_run` RPC → obtain `run_id`.
2. Run `GLOBAL_CONTROL` (prose, always injected as system-level context — not a discrete billed step in v1, see `PROMPT_MODULES.md`).
3. Run `INTAKE_NORMALIZER` → strict schema → `record_run_step`.
4. Run `INTENT_CLASSIFIER` → strict schema → `record_run_step`.
5. Call `resolve_workflow_for_run` RPC with classifier output → get authoritative `workflow_id`.
6. Run `WORKFLOW_ROUTER` (LLM) for routing rationale/logging — RPC result is authoritative per `RPC_REFERENCE.md`.
7. If workflow requires it: run `CONTEXT_FILTER` → selects `context_assets` rows to inject downstream.
8. Run `TASK_PLANNER` → strict schema → `record_run_step`.
9. For each planned substep requiring a specialist: run the relevant `SPECIALIST_*` module.
10. Run the workflow's validator(s) → strict schema → semantic guards (`validation.ts`).
11. Run the workflow's formatter → shapes `final_output`.
12. Run `RUN_LOGGER` → strict schema → summarizes the run.
13. `finalize_task_run` RPC.
14. Return response.

### Non-negotiables for this function (enforced in code review, not just documentation)

- No prompt text, no schema, and no routing rule may be a string literal in `index.ts` or any file under `orchestrate-task/`. If you're about to type a prompt into a `.ts` file, stop — it belongs in `002_seed_core_modules.sql` or a follow-up migration.
- Every OpenAI call goes through `openai.ts`'s `callOpenAIResponses` wrapper — no direct `fetch` calls to the OpenAI API from elsewhere in the function.
- Every step's output is parsed and validated before being passed to the next step. A step that fails validation halts the run with `status: "failed"` — it does not silently pass through unvalidated data (this was explicitly identified as the weak point in the pre-v1 runner; do not reintroduce it).
- Timeouts: each OpenAI call has an explicit timeout (recommend 30s) and the function has an overall budget (recommend 120s) — a hung run must fail loudly, not hang the client.
