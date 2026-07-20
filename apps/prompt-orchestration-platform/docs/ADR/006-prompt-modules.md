# ADR-006: Database-First Schema Resolution with Hardcoded Fallback

**Status:** Accepted

## Context

Structured Outputs need a JSON Schema per module. That schema could live only in code (`schemas.ts`), only in the database (`prompt_modules.output_schema_json`), or both with a resolution order.

## Decision

`prompt_modules.output_schema_json` is authoritative. `schemas.ts`'s `STEP_SCHEMAS` registry is a bootstrap/fallback used only if the database column is null — see resolution logic in `PROMPT_ENGINE.md` §4. This lets schemas be patched via database write without a redeploy (Golden Rule 2/7), while `schemas.ts` guarantees the system still works before seed migrations run or during initial bootstrap.

## Consequences

- Positive: schema changes don't require a deploy in steady state; `schemas.ts` provides a safety net during initial setup and in case of data issues.
- Negative: two places a schema could technically live creates a drift risk — `schemas.ts` and the DB can disagree. Mitigated by treating `schemas.ts` as bootstrap-only (populated once at migration time, not maintained in parallel indefinitely) and documenting this explicitly so Claude Code doesn't "fix" a schema in only one location.

## Alternatives considered

- **Schema in code only.** Rejected — violates Golden Rule 2 directly.
- **Schema in database only, no code fallback.** Rejected — fragile at bootstrap time (a fresh environment with no seed data yet has no schemas at all); the fallback costs little and removes that fragility.
