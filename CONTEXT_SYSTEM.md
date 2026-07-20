# CONTEXT_SYSTEM.md

## 1. Purpose

Before the main task runs, inject only relevant context — not everything. Too much context weakens routing and increases noise. This is a design constraint, not a suggestion: `CONTEXT_FILTER` exists specifically to prevent "inject the whole project history into every prompt" from becoming the default behaviour.

## 2. Context types (`context_assets.context_type`)

`user_preferences` · `project_context` · `template` · `schema` · `style_guide` · `donor_requirements` · `domain_rules` · `example_output` · `uploaded_document_summary`

## 3. Selection logic (Phase 2, `CONTEXT_FILTER` module)

`CONTEXT_FILTER` is an LLM step that, given the classifier output and the project's `default_context_assets`, selects which specific `context_assets` rows are relevant enough to inject. Its output schema is a list of `context_id`s plus a one-line justification per selection — the justification matters because it makes over-injection visible in `run_steps` logs during review, not just theoretically preventable.

## 4. v1 simplification

`CONTEXT_FILTER` is a Phase 2 module (`BUILD_SPEC.md` §1). For v1, `context.ts` implements a fixed, non-LLM lookup: fetch `context_assets` where `context_id = any(projects.default_context_assets)` for the run's `project_id`, filtered to `active = true`. No selective filtering — v1 either has a small, curated `default_context_assets` list per project (kept deliberately short by the consultant, not the system) or none. Do not build the LLM-based filter early "since it's not much extra work" — it needs the v1 usage data to know what over-injection actually looks like in practice.

## 5. What goes wrong if this is skipped

Per the source design principle: dumping full project history or the entire prompt library into every call degrades classifier and specialist accuracy and increases token cost without a corresponding quality gain. If Phase 1/2 testing shows specialists producing generic or off-target output, check context injection volume before assuming the prompt itself is at fault.
