# ADR-004: Single Synchronous Edge Function, Not a Queue/Worker System

**Status:** Accepted

## Context

Task execution could be built as a synchronous request/response, or as an asynchronous job queued for a background worker with polling/webhook completion.

## Decision

v1 is a single Edge Function (`orchestrate-task`) that runs the full workflow synchronously within one HTTP request and returns the final result. No queue, no separate worker process, no polling.

## Consequences

- Positive: dramatically simpler to build, debug, and reason about for v1's actual usage pattern — a consultant submits one task and waits for the result, not a high-volume async pipeline.
- Negative: request duration is bounded by the sum of every step's latency (mitigated by the 120s function budget in `EDGE_FUNCTIONS.md`); doesn't scale to `planner_plus_workers` running many parallel sub-tasks without hitting function time limits eventually.

## Alternatives considered

- **Queue + worker + webhook.** Rejected for v1 — solves a scale problem the system doesn't have yet. Revisit if `planner_plus_workers` workflows regularly exceed the function time budget, or if usage volume requires it (candidate for Phase 4+, related to ADR-015).
