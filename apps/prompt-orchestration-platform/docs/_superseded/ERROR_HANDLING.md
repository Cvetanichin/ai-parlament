# ERROR_HANDLING.md

## 1. Error taxonomy

| Code | Meaning | Where raised | Recorded as |
|---|---|---|---|
| `MODULE_NOT_FOUND` | `workflow_steps.module_id` doesn't resolve to an active `prompt_modules` row | `index.ts`, before calling OpenAI | `run_steps.status = 'failed'`, run halts |
| `WORKFLOW_NOT_FOUND` | `resolve_workflow_for_run` RPC returns no match and no fallback exists | `routing.ts` | `task_runs.status = 'failed'` |
| `OPENAI_API_ERROR` | Non-2xx from OpenAI, or timeout | `openai.ts` | `run_steps.error_message`, retried once (see §3) before failing |
| `SCHEMA_VALIDATION_FAILED` | Response didn't parse as an object, or OpenAI itself flagged non-conformance | `runPromptStep` (`PROMPT_ENGINE.md` §5) | `run_steps.status = 'failed'`, run halts for `required = true` steps |
| `SEMANTIC_VALIDATION_FAILED` | Passed schema but failed a Layer-3 guard (`validation.ts`) | `validation.ts` | `run_steps.status = 'failed'`, run halts |
| `ROUTING_MISMATCH` | `WORKFLOW_ROUTER` (LLM) and `resolve_workflow_for_run` (RPC) disagree | `routing.ts` | Logged as a `notes` entry, does not halt the run — RPC wins per `WORKFLOW_ENGINE.md` §5 |

## 2. Halt vs. continue

A `required = true` `workflow_steps` row that fails halts the entire run with `task_runs.status = 'failed'`. A `required = false` step that fails is logged with `run_steps.status = 'failed'` but the run continues, with that step's `output_key` simply absent from downstream context. Every v1 `workflow_steps` seed row should default `required = true` unless there's a specific, documented reason (e.g. an optional enrichment step) to set it false — silent partial runs are a worse failure mode than loud full failures for a system whose output feeds donor-facing or build-spec documents.

## 3. Retry policy

Retry `OPENAI_API_ERROR` once, with a short backoff (recommend 1–2s), only for retriable conditions (timeout, 429, 5xx). Do not retry `SCHEMA_VALIDATION_FAILED` or `SEMANTIC_VALIDATION_FAILED` — those indicate a prompt or schema defect, not a transient failure, and retrying with identical input will very likely reproduce the same failure while doubling cost.

## 4. Client-facing error shape

Every failure response follows the shape in `EDGE_FUNCTIONS.md`: `{ run_id, status: "failed", error: { code, message, step_name? } }`. `message` is safe to show a user (no raw OpenAI error text, no stack traces, no internal schema names) — write a short human-readable message per error code and map it in `helpers.ts`.

## 5. `needs_review` status

Distinct from `failed`. Used when a run completes technically but a validator's `overall_assessment` is `weak` — the pipeline succeeded, but the output shouldn't go straight to a donor or client without human review. This is a quality signal, not an error, and should never be conflated with `failed` in UI or logging.
