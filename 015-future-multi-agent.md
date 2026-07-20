# ADR-015: Defer Autonomous Multi-Agent Execution Beyond v1

**Status:** Accepted (deferral, not rejection)

## Context

The source architecture conversation and prompt library both gesture toward a more autonomous future: memory, vector search, multi-agent execution, human approval gates, full audit trail as distinct system capabilities (documented as "Phase 2" in the original informal roadmap, distinct from this document's Phase 2 module set — see note below). Building toward this now would mean speculative infrastructure ahead of any validated need.

## Decision

v1 through the Phase 4 hardening gate in `IMPLEMENTATION_PLAN.md` stays synchronous, single-run, human-initiated (ADR-004). No vector search / embeddings table. No autonomous chaining of multiple task runs without a human reviewing each result. No multi-agent parallel execution beyond `planner_plus_workers`' bounded sub-task pattern.

## Consequences

- Positive: v1 stays buildable and debuggable at the scope this documentation set actually specifies; avoids building speculative infrastructure for capabilities not yet validated as needed.
- Negative: if multi-agent or memory features are wanted later, they require new ADRs and likely new tables (embeddings, agent-state) not in the current schema — not a small bolt-on. This is accepted as the cost of not over-building now.

## Note on phase numbering

The original informal roadmap in the source prompt library used "Phase 1/2/3" to describe a different, coarser breakdown (DB+routing / memory+multi-agent / UI+monitoring) than this documentation set's `IMPLEMENTATION_PLAN.md` phases. Do not conflate the two — `IMPLEMENTATION_PLAN.md` is the authoritative phase sequence for this build; the source roadmap's "Phase 2" (memory, vector search, multi-agent, human approval, audit trail) maps to a future "Phase 5+" here, explicitly out of scope until this ADR is revisited.

## Alternatives considered

- **Build toward multi-agent/memory now, in parallel with v1.** Rejected — splits focus, and no current requirement demonstrates the need. Revisit once v1 is in real use and a concrete gap (not a speculative one) is identified.
