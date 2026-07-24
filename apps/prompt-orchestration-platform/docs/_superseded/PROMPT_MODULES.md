# PROMPT_MODULES.md

The full 22-module registry, carried over from `04_PromptLibrary_SystemPromptsStructure.md`. Prompt wording for each module already exists in that source document and must be migrated verbatim into `prompt_modules.prompt_text` — this document defines the contract (category, domain, schema strictness, workflow membership), not the prose.

## 1. Registry

| module_id | category | v1? | strict_output_enabled | Purpose |
|---|---|---|---|---|
| `GLOBAL_CONTROL` | core | yes | false | Global operating rules injected into every run |
| `INTAKE_NORMALIZER` | core | yes | true | Extracts goal, deliverable, constraints, ambiguity from raw user input |
| `INTENT_CLASSIFIER` | core | yes | true | Classifies task type, domain, complexity, execution pattern, risk flags |
| `WORKFLOW_ROUTER` | core | yes | true | Selects/explains workflow (RPC is authoritative — see `WORKFLOW_ENGINE.md` §5) |
| `CONTEXT_FILTER` | core | Phase 2 | true | Selects relevant `context_assets` rows for injection |
| `TASK_PLANNER` | core | yes | true | Decomposes complex tasks into ordered substeps |
| `SPECIALIST_GENERIC` | specialist | fallback | false | Generic fallback specialist when no domain specialist matches |
| `SPECIALIST_NGO_PROJECT_DESIGN` | specialist | Phase 2 | false | Project design for CSOs/NGOs |
| `SPECIALIST_ME_FRAMEWORK` | specialist | yes | false (prose+structure hybrid — see note) | M&E frameworks, logframes, indicator matrices |
| `SPECIALIST_GRANT_CONCEPT` | specialist | Phase 2 | false | Grant concept notes / proposals |
| `SPECIALIST_ADVOCACY_STRATEGY` | specialist | Phase 2 | false | Advocacy and policy strategy |
| `SPECIALIST_RESEARCH_SYNTHESIS` | specialist | Phase 2 | false | Research synthesis and literature-style synthesis |
| `SPECIALIST_PRODUCT_MVP` | specialist | yes | true (when outputting schema/build specs) | Product/app MVP design |
| `SPECIALIST_PROMPT_ENGINEERING` | specialist | yes | true | Prompt and orchestration design |
| `OPTION_GENERATOR` | utility | Phase 2 | false | Branch-and-merge: generates comparable options |
| `VALIDATOR_GENERIC` | validator | yes | true | Generic quality check — major/minor issues, overall assessment |
| `VALIDATOR_INDICATORS` | validator | yes | true | Indicator-specific quality check for M&E outputs |
| `VALIDATOR_MVP_REALISM` | validator | yes | true | Scope-realism check for MVP specs |
| `FORMATTER_DONOR_READY` | formatter | Phase 2 | false | Donor-facing prose formatting |
| `FORMATTER_TABLE_FIRST` | formatter | yes | false | Table-first structured formatting |
| `FORMATTER_JSON` | formatter | Phase 2 | true | Machine-readable JSON output |
| `RUN_LOGGER` | utility | yes | true | Summarizes a completed run for `task_runs`/`run_steps` |

**Note on `SPECIALIST_ME_FRAMEWORK`:** the source conversation is explicit that specialist prompts should go strict "when outputting indicator matrices as structured records" but can stay prose otherwise. Implementation: this module ships with `strict_output_enabled = false` initially (matches its v1 partner `VALIDATOR_INDICATORS`, which validates the *rendered* indicator table, not a raw JSON structure). Revisit in Phase 2 if the indicator matrix needs to be machine-parsed rather than just formatted — see `ADR/006-prompt-modules.md`.

## 2. Domain enum (used by `intent_classifier`, `prompt_modules.domain`, `context_assets.domain`)

`NGO_project_design` · `monitoring_and_evaluation` · `advocacy` · `grant_development` · `research_and_reporting` · `operations` · `product_and_mvp` · `prompt_engineering` · `general`

## 3. Routing rules (seed data for `routing_rules`, priority order)

| Priority | Match condition (on `INTENT_CLASSIFIER` output) | Workflow | Specialist | Validator |
|---|---|---|---|---|
| 10 | domain mentions indicator/baseline/target/logframe/M&E | `ME_FRAMEWORK` | `SPECIALIST_ME_FRAMEWORK` | `VALIDATOR_INDICATORS` |
| 20 | domain mentions proposal/concept note/grant/funding | `GRANT_CONCEPT` | `SPECIALIST_GRANT_CONCEPT` | `VALIDATOR_GENERIC` |
| 30 | domain mentions MVP/app/features/user flow/schema | `PRODUCT_MVP_DESIGN` | `SPECIALIST_PRODUCT_MVP` | `VALIDATOR_MVP_REALISM` |
| 40 | domain mentions prompt/system prompt/agent/orchestration | `PROMPT_ENGINEERING` | `SPECIALIST_PROMPT_ENGINEERING` | `VALIDATOR_GENERIC` |
| 900 | no match | fallback: `SPECIALIST_GENERIC`, `VALIDATOR_GENERIC` | — | — |

These are seed values, not hardcoded logic — they live in the `routing_rules` table and can be edited without a deploy (`PROJECT.md` Golden Rule 7). "If task asks for multiple options or comparison" adds `OPTION_GENERATOR` and switches `execution_pattern` to `branch_and_merge` — implement this as a modifier evaluated after the primary rule match, not a fifth priority row, since it can combine with any of the above.

## 4. Workflow packs

See `WORKFLOW_ENGINE.md` §6 for v1 packs. `GRANT_CONCEPT` (Phase 2) chain: `GLOBAL_CONTROL → INTAKE_NORMALIZER → INTENT_CLASSIFIER → WORKFLOW_ROUTER → CONTEXT_FILTER → TASK_PLANNER → SPECIALIST_GRANT_CONCEPT → VALIDATOR_GENERIC → FORMATTER_DONOR_READY → RUN_LOGGER`.

## 5. Migration source

Prompt text for all 22 modules already exists, written and reviewed, in `04_PromptLibrary_SystemPromptsStructure.md` §3–23 (`GLOBAL_CONTROL` at line ~1442 through `RUN_LOGGER` at line ~2397 in the source document). Claude Code's Phase 1/2 migration tasks reference that document directly for `prompt_text` values — do not regenerate or rewrite the prompts as part of a schema task.
