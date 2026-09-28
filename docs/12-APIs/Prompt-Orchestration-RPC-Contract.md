# Prompt Orchestration RPC contract

Status: implementation contract for the `audit/orchestration-rpc-layer` branch.
Source of truth: `supabase/migrations/20260720140000_17_prompt_orchestration_schema.sql`,
`20260720141500_18_prompt_orchestration_seed.sql`, and
`supabase/functions/prompt-orchestration-run/index.ts`.

## Current model

The runner is in `Cvetanichin/ai-parlament`. Its three Phase 1 workflows are
`monitoring_and_evaluation`, `product_and_mvp`, and `prompt_engineering`.
There is no physical `workflow_steps` table. A step is a JSONB transition
in `workflow_definitions.transitions`; the order is its array ordinal.
The `RunStatus` cast reported in earlier work does not occur on `main`
and must be located on its originating branch/repository before editing.

## Views (Postgres 17, security_invoker)

- `v_workflows_expanded`: workflow definition ID, name, version, states,
  vote threshold, gates, and transitions. One row per definition.
- `v_workflow_steps_expanded`: workflow definition ID, 1-based
  `step_order`, `from_state`, `to_state`, `trigger`, `agent_slug`,
  `output_key`, and the full transition JSON. One row per JSONB array
  entry, including non-agent state transitions.
- `v_routing_rules_expanded`: rule ID/name/priority, match logic, selected
  workflow ID, active flag, and optional agent overrides.

These views are internal read models. Set `security_invoker = true` and
revoke direct view access from `PUBLIC`, `anon`, and `authenticated`;
grant SELECT to `service_role` only.

## RPCs

All functions are `SECURITY INVOKER`, `STABLE`, use an empty search path,
and are callable by `service_role` only. Revoke EXECUTE from `PUBLIC`,
`anon`, and `authenticated` explicitly. The Edge Function must call
`resolveCaller` before invoking these helpers with its admin client.
No RPC accepts an organisation ID from the request body.

| Function | Arguments | Return contract |
| --- | --- | --- |
| `rpc_get_workflow_bundle` | `p_workflow_definition_id uuid` | One JSON object with `workflow` and an ordered `steps` array, or null for an unknown ID. Workflow includes `vote_of_no_confidence_threshold`. |
| `rpc_get_prompt_module_by_key` | `p_agent_slug text` | One JSON object with `agent_id`, `prompt_module_id`, `model_provider`, `model_name`, `strict_output_enabled`, and `output_schema_json`, or null if there is no active prompt. |
| `rpc_get_context_assets_for_domain` | `p_domain text` | A JSON array of active assets matching the domain, the seeded `general` domain, or the global empty-domain array, ordered by name and ID. The caller selects Global Control by name. |
| `rpc_get_active_routing_rules` | None | A JSON array of active rule objects ordered by priority and ID, including override IDs for later wiring. |

A missing active prompt is an error for registered production agents; the
runtime must not silently fall back to a mock model. A missing workflow or
route returns an explicit no-match response. The routing evaluator remains
deterministic; `match_logic_json` currently supports the seeded single
`match.field` / `match.equals` shape. Expanding it requires a contract
version and tests.

## Verification gates

1. Reset an isolated local database with all migrations, then assert view
   row counts and transition order against the three seeded workflows.
2. Call every RPC as `service_role`; assert null/empty results and ordered
   positive results. Assert `anon` and `authenticated` cannot execute or
   select internal views.
3. Run Deno type checks, lint and unit tests after swapping callers.
4. Exercise the Edge Function as an authorised project member and as a
   non-member. Check persisted run state and response shape.
