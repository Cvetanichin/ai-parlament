# ADR-001: System Architecture — Database-Driven Orchestration

**Status:** Accepted

## Context

The consultancy already runs a de facto prompt orchestration process through ad hoc ChatGPT sessions: an intake step, a classification step, a domain specialist, a validation pass, and formatting. This complexity already exists — the question is whether to leave it ungoverned in chat history or make it an auditable system.

## Decision

Build a layered architecture where the database (Postgres/Supabase) is the source of truth for prompts, schemas, and workflow definitions, and application code (Edge Functions) is a thin, replaceable orchestration shell: `Database → Edge Function → Workflow Engine → Prompt Modules → Validator → Formatter → Run Logger`. See `ARCHITECTURE.md`.

## Consequences

- Positive: prompts and workflows can change without a deploy; every run is auditable; complexity is centralized instead of scattered across individual consultants' chat habits.
- Negative: more infrastructure than a single well-crafted ChatGPT custom instruction — accepted because the source prompt library already documents 22 modules and 4+ workflow packs in active informal use, i.e. the complexity is not being introduced by this decision, only made governable.

## Alternatives considered

- **Hardcode workflows in application code.** Rejected — every prompt or routing change would require a deploy, and Golden Rule 7 (`PROJECT.md`) explicitly requires replaceability without code changes.
- **Keep using ChatGPT conversations directly.** Rejected — no versioning, no audit trail, no reuse across the consultancy.
