# ADR-008: SQL RPC Is the Routing Authority, Not the LLM

**Status:** Accepted

## Context

`WORKFLOW_ROUTER` is an LLM step that proposes a workflow. Left alone, the LLM's choice would be the final routing decision — probabilistic, and not fully auditable in terms of "why this rule fired."

## Decision

`resolve_workflow_for_run`, a deterministic SQL RPC evaluating `routing_rules` by priority, is the authoritative router. `WORKFLOW_ROUTER` (LLM) still runs — its value is generating human-readable rationale and flagging edge cases — but its `selected_workflow` is checked against, not substituted for, the RPC result. Disagreement is logged (`ROUTING_MISMATCH`, `ERROR_HANDLING.md`) as a signal for prompt tuning, not silently resolved either way.

## Consequences

- Positive: routing is deterministic, testable, and auditable — a consulting practice needs to be able to answer "why did this get routed to grant-concept" with a rule, not a probability.
- Negative: `routing_rules` must be kept comprehensive enough that the RPC doesn't fall back to `SPECIALIST_GENERIC` too often; requires deliberate maintenance as new domains are added, rather than trusting the classifier to generalize.

## Alternatives considered

- **LLM router is authoritative.** Rejected — non-deterministic, harder to audit, and the exact failure mode the pre-production runner was criticized for (accepting whatever came back).
