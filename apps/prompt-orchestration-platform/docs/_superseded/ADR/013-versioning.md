# ADR-013: Module/Schema Versioning via Named Strings; No Workflow Versioning in v1

**Status:** Accepted

## Context

Prompts and schemas will change as consulting practice evolves. In-place edits to an `active` module would retroactively change the meaning of past runs that referenced it — unacceptable for a system whose value proposition includes audit trail.

## Decision

`prompt_modules.version` (plain string) plus embedded version in schema names (`intake_normalizer_v1`, `PROMPT_ENGINE.md` §2) plus a `draft`/`active`/`deprecated` status lifecycle. Never edit an `active` module's `prompt_text` or `output_schema_json` in place — bump version, promote through `draft`, deprecate the old version (never delete it). Workflows themselves are not versioned in v1 — a workflow change is a direct edit to `workflow_steps`. Full detail: `VERSIONING.md`.

## Consequences

- Positive: past runs remain interpretable against the schema version they actually used; no retroactive meaning changes.
- Negative: no workflow-level rollback/audit trail if a `workflow_steps` edit turns out wrong — must be fixed forward with another edit. Accepted at current scale (4 workflows); flagged for revisit if workflow churn increases (`VERSIONING.md` §3).

## Alternatives considered

- **Version everything, including workflows, from day one.** Rejected — added complexity without a demonstrated need yet at 4 workflows; module/schema versioning is the piece that's actually load-bearing for the audit-trail goal.
