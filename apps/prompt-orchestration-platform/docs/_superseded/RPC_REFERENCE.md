# RPC_REFERENCE.md

Postgres RPC functions used where a write must be atomic across tables, or where logic is genuinely a database-level concern (per `PROJECT.md` Golden Rule 3: business rules belong in SQL, not TypeScript conditionals). Simple single-table reads go through the Supabase client directly and are not listed here.

## `create_task_run(p_user_input text, p_project_id text, p_user_id uuid)`

**Returns:** `uuid` (`run_id`)
**Purpose:** Atomically inserts a `task_runs` row with `status = 'queued'`. Called once, at the start of orchestration, before any prompt module runs.
**Contract:** must never fail silently — raises on invalid `project_id`/`user_id` foreign keys rather than inserting orphaned data.

```sql
create or replace function create_task_run(
  p_user_input text,
  p_project_id text default null,
  p_user_id uuid default null
) returns uuid
language plpgsql
as $$
declare
  v_run_id uuid;
begin
  insert into task_runs (user_input, project_id, user_id, status)
  values (p_user_input, p_project_id, p_user_id, 'queued')
  returning run_id into v_run_id;
  return v_run_id;
end;
$$;
```

## `record_run_step(p_run_id uuid, p_step_order int, p_step_name text, p_module_id text, p_input jsonb, p_output jsonb, p_status text, p_duration_ms int, p_error text)`

**Returns:** `void`
**Purpose:** Atomically inserts a `run_steps` row. Called by the Edge Function after every step, success or failure.
**Contract:** must not throw on a valid `run_id` even if the step itself failed — a failed step is still a recorded fact, not an exception at the DB layer. Reject only truly invalid input (bad `run_id`, invalid `p_status` enum value).

## `finalize_task_run(p_run_id uuid, p_status text, p_final_output text, p_final_output_json jsonb, p_quality_assessment text)`

**Returns:** `void`
**Purpose:** Atomically closes out a `task_runs` row once the workflow completes (or fails).
**Contract:** idempotent — calling twice on the same `run_id` with the same arguments must not error or duplicate anything (it's an update, not an insert).

## `resolve_workflow_for_run(p_domain text, p_task_signals text[])`

**Returns:** `table (workflow_id text, specialist text, validator text, formatter text)`
**Purpose:** Evaluates `routing_rules` in priority order against the classifier output and returns the first matching workflow plus any overrides. This is the SQL implementation of the router rules documented in `PROMPT_MODULES.md` §Routing.
**Contract:** this function, not TypeScript, owns routing decision logic. `WORKFLOW_ROUTER` (the LLM step) proposes a `selected_workflow`; this RPC is the deterministic, auditable check that actually authorizes it against `routing_rules`. If they disagree, the RPC result wins and the disagreement is logged as a `notes` entry on the `run_steps` row — this is a signal the classifier prompt may need tuning, not something to silently paper over.

**Why an RPC and not app code:** routing rules change as the consultancy's domains evolve. A rule change should be a database write (new `routing_rules` row), not a code deploy. See ADR-008.
