# TESTING_STRATEGY.md

## 1. What must be tested before a module is "done"

Per `BUILD_SPEC.md` §5, a `prompt_modules` row is not complete without a passing test in `supabase/tests/orchestrator.test.ts` that:
1. Calls the module with a realistic fixture input.
2. Asserts the response, when `strict_output_enabled = true`, validates against its `output_schema_json`.
3. Asserts any Layer-3 semantic guard that applies to that module's role passes on a valid fixture and correctly throws on a deliberately invalid one (e.g. feed `validatePlannerOutput` a substeps array with out-of-order `step_number` and assert it throws).

## 2. Test levels

| Level | Scope | Tooling |
|---|---|---|
| Unit | `helpers.ts`, `validation.ts` guards, `safeParseJson` edge cases | Deno's built-in test runner |
| Integration | `runPromptStep` against a real OpenAI call for each control-plane module | Deno test runner, gated behind an env flag (costs money/tokens — don't run on every CI push) |
| End-to-end | Full `orchestrate-task` invocation for each v1 workflow (`ME_FRAMEWORK`, `PRODUCT_MVP_DESIGN`, `PROMPT_ENGINEERING`) against a seeded local/staging Supabase project | Manual or scheduled CI, not on every commit |
| Regression | Re-run a fixed set of representative fixtures whenever a module's `prompt_text` or schema is bumped to a new version | Manual trigger before promoting `draft` → `active` |

## 3. What CI runs on every push

Unit tests and schema-shape assertions only (no live OpenAI calls — mock `callOpenAIResponses` for these). Integration and end-to-end tests are cost-bearing and run on demand or on a schedule, not per-commit — document this decision if it's revisited, since it directly trades CI thoroughness against OpenAI spend.

## 4. Coverage expectation for Phase 4 sign-off

Every v1 module (§`BUILD_SPEC.md` §1, 12 modules) has at least one passing unit test and one passing end-to-end workflow test by the Phase 4 gate. This is a hard acceptance criterion, not a target to approximate.

## 5. Fixtures

Store realistic (not toy) fixture inputs per domain — an actual anonymized M&E request, an actual product idea description, an actual prompt-engineering request — in `supabase/tests/fixtures/`. Toy fixtures ("test input 1") don't exercise the ambiguity-handling behaviour these prompts are actually designed for.
