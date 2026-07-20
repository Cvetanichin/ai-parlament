# OUTPUT_FORMATS.md

## 1. Formatter modules and their contract

| module_id | `output_formats.format_type` | v1? | Behaviour |
|---|---|---|---|
| `FORMATTER_TABLE_FIRST` | `table` | yes | Structures output as tables-first with minimal surrounding prose. Default for `ME_FRAMEWORK`, `PRODUCT_MVP_DESIGN`, `PROMPT_ENGINEERING` workflows. |
| `FORMATTER_DONOR_READY` | `doc_ready` | Phase 2 | Full prose, donor-facing tone, no visible internal reasoning or module names. Default for `GRANT_CONCEPT`. |
| `FORMATTER_JSON` | `json` | Phase 2 | Machine-readable output for downstream automation (e.g. feeding another system). Strict schema. |

`memo`, `spec`, `slide_outline` format types exist in the `output_formats` table's check constraint for forward compatibility but have no v1 formatter module — do not build a module for them until a workflow actually needs one.

## 2. Contract every formatter must satisfy

A formatter receives the validated specialist output (post-`VALIDATOR_*`) and the requested `output_format_hint` (if any, from the original request), and produces `final_output` — the value returned to the client and stored in `task_runs.final_output` / `final_output_json`. A formatter must never introduce new factual claims — it restructures and re-tones, it does not add content the specialist didn't produce. This is a validation-adjacent concern: if a formatter is observed adding content, that's a prompt defect to fix in `prompt_modules.prompt_text`, not something a downstream guard should try to catch after the fact.

## 3. Selecting a formatter

`workflows.default_formatter` sets the default; `routing_rules.formatter_override` can override per-rule; `output_format_hint` in the original request can override further if the workflow explicitly supports hint-based override (not all should — e.g. `ME_FRAMEWORK` output should probably always stay table-first regardless of hint, since indicator matrices lose meaning as prose). Document this per-workflow in `workflows.notes` when seeding v1 data.
