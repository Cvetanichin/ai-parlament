# IMPLEMENTATION_PLAN.md

**The phased checklist. Claude Code works from this file task-by-task — never "build everything." Each task should be requested individually, e.g.: "Implement Phase 1, Task 3. Read PROJECT.md, BUILD_SPEC.md, and the relevant ADR first. Do not modify unrelated files. Output: updated files, migration if required, tests, summary. Then stop."**

No phase begins until the prior phase's acceptance gate (`BUILD_SPEC.md` §6) is confirmed by the project owner.

---

## Phase 0 — Reconciliation Audit (do this first, no exceptions)

The repo already has partial implementation from earlier work. Do not assume a blank slate.

- [x] 0.1 Inventory the existing repo structure against `BUILD_SPEC.md` §2. List what exists, what's missing, what's present but diverges from spec.
- [x] 0.2 Inventory existing database migrations (if any) against `DATABASE.md`. Identify schema drift. *(Partial — blocked on confirming the target Supabase project; see report.)*
- [x] 0.3 Inventory existing Edge Function code against `EDGE_FUNCTIONS.md` and `PROMPT_ENGINE.md` — specifically check whether the runner already has the `json_object`-mode / silent-fallback-parsing weak point described in ADR-010, since that's the primary defect this spec exists to fix.
- [x] 0.4 Produce a written gap report (`docs/RECONCILIATION_REPORT.md`) — no code changes in this phase. The project owner reviews and confirms before Phase 1 starts.

**Acceptance gate:** gap report exists at `RECONCILIATION_REPORT.md`, **not yet reviewed/confirmed by owner** — three open decisions block Phase 1 (target Supabase project, relationship between the two prompt sources, fate of `PromptLibraryV7_2.jsx`). Do not start Phase 1 until the owner confirms.

---

## Phase 1 — Control Plane

- [ ] 1.1 Migration `001_init_schema.sql` — all 11 tables per `DATABASE.md` §2 (reconciled against Phase 0 findings, not blindly re-applied if tables already exist).
- [ ] 1.2 Migration `002_seed_core_modules.sql` — seed rows for `GLOBAL_CONTROL`, `INTAKE_NORMALIZER`, `INTENT_CLASSIFIER`, `WORKFLOW_ROUTER`, `TASK_PLANNER` (prompt text sourced verbatim from `04_PromptLibrary_SystemPromptsStructure.md`, per `PROMPT_MODULES.md` §5).
- [ ] 1.3 Migration `003_add_strict_output_schema.sql` — `strict_output_enabled` column + control-plane rows set `true`, per `DATABASE.md` §2.
- [ ] 1.4 `types.ts` — shared types, typed unions for module/workflow/status enums (`CODING_STANDARDS.md` §1).
- [ ] 1.5 `schemas.ts` — `STEP_SCHEMAS` bootstrap registry for the 5 control-plane modules (`PROMPT_ENGINE.md` §3–4).
- [ ] 1.6 `openai.ts` — `callOpenAIResponses` wrapper (`PROMPT_ENGINE.md` §4).
- [ ] 1.7 `helpers.ts` — `buildModelInput`, `safeParseJson`.
- [ ] 1.8 `index.ts` — `runPromptStep`, control-plane loop only (no specialists/validators/formatters yet).
- [ ] 1.9 RPC functions: `create_task_run`, `record_run_step`, `finalize_task_run`, `resolve_workflow_for_run` (`RPC_REFERENCE.md`).
- [ ] 1.10 `validation.ts` — `validateRoutingDecision`, `validatePlannerOutput` (`PROMPT_ENGINE.md` §7).
- [ ] 1.11 Unit tests for all of the above (`TESTING_STRATEGY.md` §1–2).

**Acceptance gate:** `INTAKE_NORMALIZER → INTENT_CLASSIFIER → WORKFLOW_ROUTER → TASK_PLANNER` runs end-to-end against a live local Supabase stack, each step's output validates against its schema, each has a passing unit test (`BUILD_SPEC.md` §6).

---

## Phase 2 — v1 Specialists, Validators, Formatter

- [ ] 2.1 Seed `SPECIALIST_ME_FRAMEWORK`, `SPECIALIST_PRODUCT_MVP`, `SPECIALIST_PROMPT_ENGINEERING` rows. Use the improved prompt text in `SPECIALIST_PROMPTS_SEED.md` (enriched from the retired `PromptLibraryV7_2.jsx` prompt library), not the plainer drafts in `04_PromptLibrary_SystemPromptsStructure.md` §10/§14/§15.
- [ ] 2.2 Seed `VALIDATOR_GENERIC`, `VALIDATOR_INDICATORS`, `VALIDATOR_MVP_REALISM` rows + schemas.
- [ ] 2.3 Seed `FORMATTER_TABLE_FIRST` row.
- [ ] 2.4 Seed `RUN_LOGGER` row + schema.
- [ ] 2.5 Seed `workflows`/`workflow_steps` rows for `ME_FRAMEWORK`, `PRODUCT_MVP_DESIGN`, `PROMPT_ENGINEERING` (`WORKFLOW_ENGINE.md` §6).
- [ ] 2.6 Seed `routing_rules` per `PROMPT_MODULES.md` §3.
- [ ] 2.7 `context.ts` — v1 fixed-lookup context injection (`CONTEXT_SYSTEM.md` §4).
- [ ] 2.8 `logger.ts` — `RUN_LOGGER` integration.
- [ ] 2.9 `validateAssessment` guard + any additional guards identified during Phase 1 (`PROMPT_ENGINE.md` §7).
- [ ] 2.10 Extend `index.ts`'s loop to run the full v1 chain: specialist → validator → formatter → logger.
- [ ] 2.11 End-to-end tests for all three v1 workflows against realistic fixtures (`TESTING_STRATEGY.md` §5).

**Acceptance gate:** all three v1 workflows produce a formatted, logged, validated output for a realistic test input each.

---

## Phase 3 — Frontend + v1.1 Modules

- [ ] 3.1 React + Tailwind app: task submission form, run status display, `final_output` rendering.
- [ ] 3.2 Seed `CONTEXT_FILTER` module + upgrade context injection from fixed lookup to LLM-based selective filtering (`CONTEXT_SYSTEM.md` §3).
- [ ] 3.3 Seed `SPECIALIST_NGO_PROJECT_DESIGN`, `SPECIALIST_GRANT_CONCEPT`, `SPECIALIST_ADVOCACY_STRATEGY`, `SPECIALIST_RESEARCH_SYNTHESIS`.
- [ ] 3.4 Seed `FORMATTER_DONOR_READY`, `FORMATTER_JSON`.
- [ ] 3.5 Seed `GRANT_CONCEPT` workflow.
- [ ] 3.6 Seed `OPTION_GENERATOR` + first `branch_and_merge` workflow.

**Acceptance gate:** internal team can submit tasks and view results through the UI without touching Supabase directly; v1.1 module set live.

---

## Phase 4 — Hardening

- [ ] 4.1 RLS migration per `SECURITY_MODEL.md` §3.
- [ ] 4.2 Full test coverage per `TESTING_STRATEGY.md` §4 (every module, unit + end-to-end).
- [ ] 4.3 Deployment runbook exercised staging → production per `DEPLOYMENT.md`.
- [ ] 4.4 Error handling audit — every code path in `ERROR_HANDLING.md` §1 has a corresponding test.
- [ ] 4.5 Review ADR-015 — confirm no Phase 5+ (multi-agent/memory) work is needed yet, or open a new ADR if it is.

**Acceptance gate:** security review passed, coverage targets met, deployment runbook exercised successfully at least once.

---

## Out of scope until a new ADR is written

Multi-agent autonomous execution, vector search/embeddings, multi-provider model routing, public multi-tenancy, queue/worker async execution. See ADR-004, 010, 011, 015.
