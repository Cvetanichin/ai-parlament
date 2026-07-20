# ADR-007: Deferred, Filtered Context Injection

**Status:** Accepted

## Context

Prompt quality depends heavily on what context is injected. Injecting everything available (full project history, all templates, all prior outputs) is the easy default and the wrong one — it weakens routing and specialist accuracy and increases cost.

## Decision

Context injection is selective by design (`CONTEXT_SYSTEM.md`). Full LLM-driven selective filtering (`CONTEXT_FILTER` module) is deferred to Phase 2; v1 uses a simple fixed lookup against a project's curated `default_context_assets` list.

## Consequences

- Positive: v1 avoids building a context-filtering module before there's usage data on what over-injection actually looks like in this system; avoids the documented failure mode (context noise degrading routing) from day one by keeping v1 context lists small and curated.
- Negative: v1 context selection is coarser than the target design — a whole project's default list is injected or nothing is, with no per-task relevance filtering. Acceptable because v1 projects are expected to have short, curated context lists by convention, not because the system enforces it.

## Alternatives considered

- **Build `CONTEXT_FILTER` in Phase 1.** Rejected — premature; better designed after real usage shows what needs filtering.
- **No context injection system at all.** Rejected — donor requirements, style guides, and project history are explicitly part of the value proposition (donor-ready output).
