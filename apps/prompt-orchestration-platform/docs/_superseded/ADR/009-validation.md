# ADR-009: Three-Layer Validation

**Status:** Accepted

## Context

Structured Outputs (schema enforcement, ADR-010) guarantee shape, not correctness. A classifier can return a syntactically valid domain enum value while picking the objectively wrong domain. Relying on schema conformance alone would miss this entire class of error.

## Decision

Three layers, all required, none optional: (1) model-side schema enforcement via OpenAI Structured Outputs, (2) app-side parse verification (`safeParseJson`), (3) semantic guards in `validation.ts` (`validateRoutingDecision`, `validatePlannerOutput`, `validateAssessment`, and module-specific extensions). See `PROMPT_ENGINE.md` §6–7.

## Consequences

- Positive: catches both structural and logical failures; a `required = true` step's failure at any layer halts the run rather than propagating a bad result downstream.
- Negative: writing and maintaining Layer 3 guards is manual, ongoing work per module — not automatically derived from the schema. Accepted as the necessary cost of catching semantic errors a schema fundamentally cannot express.

## Alternatives considered

- **Schema enforcement only.** Rejected — explicitly identified in the source design analysis as insufficient; schema-valid does not mean logically good.
