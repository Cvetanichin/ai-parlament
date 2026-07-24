# ADR-002: Database Design — Postgres, Translated from the Validated Airtable Model

**Status:** Accepted

## Context

An earlier no-code MVP used Airtable with an 11-table schema (`Prompt_Modules`, `Workflows`, `Workflow_Steps`, `Context_Assets`, `Routing_Rules`, `Output_Formats`, `Validators`, `Task_Runs`, `Run_Steps`, `Projects`, `Users`), fully field-mapped and validated against real workflow packs. Moving to a production backend (ADR-010, Supabase/OpenAI Responses API) requires a database, and re-deriving the schema from scratch would discard validated design work.

## Decision

Translate the Airtable schema directly into Postgres DDL (`DATABASE.md`), table-for-table and field-for-field, converting Airtable linked records to foreign keys, multi-select fields to `text[]`, and "JSON as text" fields to native `jsonb`. Add one new column, `prompt_modules.strict_output_enabled`, to support the structured-outputs decision (ADR-009).

## Consequences

- Positive: no schema redesign risk; the 11-table model already reflects real usage patterns from workflow packs (`ME_FRAMEWORK`, `GRANT_CONCEPT`, `PRODUCT_MVP_DESIGN`, `PROMPT_ENGINEERING`).
- Negative: some Airtable-era modeling choices (e.g. `projects.default_context_assets` as an array rather than a join table) carry forward without re-examination. Acceptable at current scale; flagged in `DATABASE.md` §4 for revisit if it becomes a bottleneck.

## Alternatives considered

- **Design a fresh normalized schema from requirements.** Rejected — higher risk, no clear benefit over a model that's already been validated against real workflow packs.
