# ADR-010: OpenAI Responses API with Strict Structured Outputs, Single Provider

**Status:** Accepted

## Context

The pre-production runner used generic `json_object` mode and parsed whatever came back, with silent fallback parsing on control-plane steps — identified as a weak point that's "practical for v1, but brittle in production." A stronger mechanism was needed for control-plane and select specialist steps.

## Decision

Use OpenAI's Responses API with Structured Outputs: `text.format.type = "json_schema"`, a named schema, `strict: true`, for all modules where `strict_output_enabled = true` (control plane always; specialists selectively — see `PROMPT_ENGINE.md` §1). Single model provider (OpenAI) for v1 — no abstraction layer for swapping providers.

## Consequences

- Positive: schema conformance enforced at the model layer, not just hoped for and parsed defensively; removes the silent-fallback-parsing weak point entirely for strict steps.
- Negative: locked to OpenAI's specific Structured Outputs feature set (a subset of JSON Schema is supported under `strict` mode — schemas must be written within that subset, documented per-module as they're authored). No multi-provider fallback if OpenAI has an outage — accepted as a v1 tradeoff given team size and the added complexity multi-provider abstraction would introduce for no near-term benefit.

## Alternatives considered

- **Generic `json_object` mode with defensive parsing (status quo).** Rejected — explicitly the identified weak point motivating this whole documentation effort.
- **Multi-provider abstraction (e.g. LangChain-style adapter).** Rejected for v1 — premature; introduces a framework not currently justified by any concrete multi-provider requirement. Revisit only if cost or availability forces it (`PROJECT.md` §8).
