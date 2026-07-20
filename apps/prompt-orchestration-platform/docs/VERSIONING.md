# VERSIONING.md

## 1. What gets versioned

Prompt modules, output schemas, and workflows — anything that changes based on consulting practice evolving, not code changing.

## 2. Module and schema versioning

- `prompt_modules.version` is a plain string (`v1`, `v1.1`, `v2`) bumped whenever `prompt_text` or `output_schema_json` changes meaningfully. A wording tweak that doesn't change structure or intent doesn't require a bump; a schema field addition, removal, or enum change does.
- Schema names embed the version (`intake_normalizer_v1`, `intake_normalizer_v2`) per `PROMPT_ENGINE.md` §2 — this means an in-flight `task_runs` row referencing an older schema version never breaks retroactively, since old and new schema definitions coexist under different names.
- `status` (`draft` / `active` / `deprecated`) governs whether the router can select a module, independent of version number. A new version starts `draft`, gets promoted to `active` after Phase-gate testing, and the prior version moves to `deprecated` (not deleted — needed for audit trail on old `run_steps` rows).

## 3. Workflow versioning

Workflows don't have an explicit version column in v1 (`DATABASE.md` §2) — a workflow change is a direct edit to `workflow_steps` rows. This is acceptable at current scale (4 workflows) but should be revisited if workflow churn increases — see `ADR/013-versioning.md` for the threshold at which workflow versioning becomes worth the added complexity.

## 4. What must never happen

- Never overwrite `prompt_text` or `output_schema_json` on an `active` module in place without going through `draft` first. In-place edits to an active module retroactively change the meaning of past runs referencing it, which breaks the audit trail this whole system exists to provide.
- Never delete a `prompt_modules` row referenced by any `run_steps.module_id` — deprecate, don't delete.
