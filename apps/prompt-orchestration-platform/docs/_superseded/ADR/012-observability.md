# ADR-012: `run_steps`/`task_runs` as the Observability Layer, No External Tooling in v1

**Status:** Accepted

## Context

Understanding what happened in a run — which module ran, what it returned, whether it failed, how long it took — needs to be answerable without reading raw provider logs.

## Decision

`task_runs` and `run_steps` (`DATABASE.md`) are the observability layer: every step is recorded with `input_json`, `output_json`, `status`, `duration_ms`, and `error_message`. No external observability tool (Datadog, Honeycomb, etc.) is introduced in v1 — Postgres queries against these tables are sufficient at current scale.

## Consequences

- Positive: no new infrastructure dependency; observability data lives next to the business data it describes, queryable with plain SQL.
- Negative: no built-in alerting, dashboards, or trace visualization — someone has to query `task_runs`/`run_steps` manually or build a lightweight internal view (candidate Phase 3 frontend feature). Acceptable at current run volume.

## Alternatives considered

- **Adopt an external observability platform now.** Rejected — no current volume that justifies it, and it would be infrastructure introduced ahead of need, which `PROJECT.md` §6 explicitly disallows without an ADR (this one, now on record as a deliberate deferral, not an oversight).
