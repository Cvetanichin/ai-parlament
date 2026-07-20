---
document: Phase 0 Reconciliation Audit
required_by: IMPLEMENTATION_PLAN.md §"Phase 0 — Reconciliation Audit"
status: DRAFT — awaiting Product Owner review and confirmation (BUILD_SPEC.md §6 acceptance gate). No Phase 1 work should start until this is confirmed.
prepared: 2026-07-20
---

# Reconciliation Report — Prompt Orchestration Platform

Per `IMPLEMENTATION_PLAN.md` Phase 0: no code changes were made while producing this report. It only inventories what exists against what `BUILD_SPEC.md`, `DATABASE.md`, `EDGE_FUNCTIONS.md`, and `PROMPT_ENGINE.md` specify.

## 0.1 Repo structure vs. `BUILD_SPEC.md` §2

**Verdict: spec-only. Zero application code exists for this system anywhere in the repo.**

| BUILD_SPEC.md §2 target | Current state |
|---|---|
| `docs/` (18 spec files + `ADR/` with 15 files) | Present, at `apps/prompt-orchestration-platform/docs/` rather than repo root — a deliberate deviation, not a gap. The repo root's own `docs/` is already the fully-built, unrelated EAS/CSO Playground OS specification (`docs/01-Product-Vision` … `docs/21-ADRs`); putting this system's docs there would have collided both in path and in meaning. All 18 files + 15 ADRs are present and accounted for. |
| `docs/04_PromptLibrary_SystemPromptsStructure.md`, `chat convers.rtf` (cited by `DATABASE.md`, `PROMPT_MODULES.md`, `PROMPT_ENGINE.md` as source material) | **Now present** (added alongside this report) — they were never committed to this repo; found on the Product Owner's local Desktop and added. Confirmed by inspection: `04_PromptLibrary_SystemPromptsStructure.md` (3,719 lines) is a stitched multi-part design conversation that contains, in full: the literal prompt text for all 9 control-plane modules + `SPECIALIST_ME_FRAMEWORK` (§2–10), all remaining v1/v1.1 specialist/validator/formatter prompts (§11–23), 4 example workflow packs (§24), and — critically — an "Exact Airtable field-by-field setup sheet" (line 3435+) that matches `DATABASE.md`'s 11-table Postgres DDL field-for-field with no discrepancies found. This file is buildable source material, not a placeholder. |
| `supabase/migrations/001_init_schema.sql`, `002_seed_core_modules.sql`, `003_add_strict_output_schema.sql` | **Do not exist.** No migration in this repo's `supabase/migrations/` targets any of the 11 tables in `DATABASE.md` §2 (`prompt_modules`, `workflows`, `workflow_steps`, `context_assets`, `routing_rules`, `output_formats`, `validators`, `projects`, `users`, `task_runs`, `run_steps`). See §0.2 below for the important nuance on `prompt_modules` and `projects`. |
| `supabase/functions/orchestrate-task/` (`index.ts`, `types.ts`, `schemas.ts`, `openai.ts`, `routing.ts`, `context.ts`, `validation.ts`, `helpers.ts`, `logger.ts`) | **Do not exist.** `supabase/functions/` in this repo contains only EAS's functions (`workflow-research-run`, `workflow-governance-run`, `workflow-gate-decide`, `eligibility-report-run`, `eligibility-report-get`, `embedding-pipeline-run`) — none relate to this system. See §0.3. |
| `supabase/tests/orchestrator.test.ts` | Does not exist. |
| `frontend/` (React + Tailwind, Phase 3 scope) | Does not exist as scoped. Note: the repo root does have a generic React/Vite/Tailwind scaffold (`src/`, `package.json`, etc.) added in the same upload as this doc set, but inspection confirmed it implements an unrelated "Error Handling Strategy Demo" (network/API/validation error triggers, toast/error-log viewer) — no `orchestrate-task` call, no reference to `task_runs`/`prompt_modules`/workflows anywhere in it. **Do not treat it as Phase 3 starter code; it isn't.** |
| Prior real-world artifact **not** named anywhere in `BUILD_SPEC.md` §2, but directly relevant | `PromptLibraryV7_2.jsx` (Product Owner's `~/Downloads/`, ~1,628 lines, latest of two distinct versions — `V7`/`V7_1` are byte-identical to each other and older; `V7_2` and its two accidental re-download copies are byte-identical to each other and newer). This is a **complete, currently-working, single-file React app** — "Cvetanichin Prompt Library v05" — with 77 real consulting task prompts (`PL-001`…`PL-077`, categories matching `PROMPT_MODULES.md`'s domain list) and 13 system-prompt personas (`SP-001`…`SP-013`+), full CRUD, JSON/CSV/MD import, an AI-assisted "improve this prompt" side panel (calls Anthropic's Messages API directly, client-side, streaming — see §0.3), all persisted to browser `localStorage` under key `cvetanichin-pl-v5`. **This is the actual artifact `ARCHITECTURE.md` §4 describes as "existing complexity... trapped in one person's prompt habits"** that this whole system exists to formalize. It is a distinct body of content from `04_PromptLibrary_SystemPromptsStructure.md`'s 22-module orchestration registry: the JSX holds finished, human-facing *deliverable* prompts (specialist-level content); the `.md` file holds the *meta*-prompts that classify/route/plan/validate/format around them. Both are real and both matter for Phase 2 (`SPECIALIST_ME_FRAMEWORK` and friends should plausibly draw on the JSX's `PL-XXX` prompts as worked examples/context, not just the `.md` file's own specialist prompt drafts) — worth a Product Owner call before Phase 2, not a Phase 0 decision. |

## 0.2 Database migrations vs. `DATABASE.md` — schema drift

**Checked against both Supabase projects in this Supabase organisation that are `ACTIVE_HEALTHY`:**

- **`urhocsijfzkepebsmstx` ("cso-playground")** — this is EAS's project (confirmed separately). It already has a table named **`prompt_modules`** (3 rows, RLS `select using (true)`) and a table named **`projects`** (0 rows, project-management domain fields: `client_id`, `budget`, etc.) — **both names collide with two of this system's 11 target table names**, but with completely different schemas and purposes (EAS's `prompt_modules` stores ministry/agent prompts for the Parliament governance system; EAS's `projects` is a CSO grant/project-management entity). **If this system is ever migrated into this same Supabase project, `001_init_schema.sql` cannot be applied as-written — it would either collide or require renaming.** This repo's `IMPLEMENTATION_PLAN.md` and `BUILD_SPEC.md` do not currently name a target Supabase project at all, so this collision is latent, not yet triggered — but it needs a decision before Phase 1's migration is written, not after.
- **`jorpfsrvhnelnboupiyx` ("Consultancy Dashboard")** — EAS's production project; not inspected further here since it shares the same collision profile as above and is even less likely to be this system's intended home (it's the org's paying-customer product).
- **`boiqtfoymcmdgqnfkzjd` ("prompt-architect-pro")** — name strongly suggests this is this system's actual intended Supabase project, created 2026-05-04 (predates the EAS project's 2026-05-13 creation date, consistent with `PROJECT.md`'s framing of an "earlier" effort). **Currently `INACTIVE` (paused).** A `list_tables` call against it timed out while paused. **Its actual schema state is unverified** — it could already contain a partial or full implementation of `DATABASE.md`'s 11 tables (in which case Phase 1.1's migration needs to reconcile against real state, not assume a blank slate, exactly as `IMPLEMENTATION_PLAN.md` 0.2 warns), or it could be empty. Resuming a paused Supabase project is a state-changing action with possible billing implications — **not done as part of this report; needs explicit Product Owner go-ahead.**

**Conclusion for 0.2: no migration drift can be assessed with confidence until `prompt-architect-pro` is either confirmed as the target project and resumed for inspection, or explicitly ruled out in favor of a different project.** This is the single highest-priority open question blocking a real Phase 1.1.

## 0.3 Edge Function code vs. `EDGE_FUNCTIONS.md` / `PROMPT_ENGINE.md` (ADR-010 defect check)

**No `orchestrate-task` Edge Function, or any code implementing this system's classify → route → plan → specialist → validate → format pipeline, exists anywhere in this repo or its git history** (confirmed: `git log --all` for any file matching this system's expected filenames returns only today's single spec-upload commit).

`ADR-010`'s stated rationale — "the pre-production runner used generic `json_object` mode and parsed whatever came back, with silent fallback parsing on control-plane steps" — describes a defect in **some prior runner that is not present in this repository**. The only OpenAI/Claude-calling code found anywhere adjacent to this system is `PromptLibraryV7_2.jsx`'s `AIAssistantPanel` (§0.1 above), and it does **not** match this description: it calls Anthropic's Messages API directly (not OpenAI), with `stream: true` and no schema/`json_object` mode at all — it's a free-text streaming assistant, not a control-plane classifier/router. It is not the runner ADR-010 is describing.

**Two possibilities, not resolved by this report:**
1. The "pre-production runner" was hypothetical/illustrative within the design conversation (`chat convers.rtf`) rather than code that was ever actually run — i.e. ADR-010 is arguing against a *risk*, not a *found defect*.
2. It exists in the paused `prompt-architect-pro` project's Edge Functions, unexaminable while paused (same blocker as §0.2).

**Practical effect on Phase 1: none.** Since no runner code exists in this repo to reconcile against, Phase 1's `index.ts`/`schemas.ts`/`openai.ts`/etc. can be written fresh, following `EDGE_FUNCTIONS.md` and `PROMPT_ENGINE.md` exactly as specified — there is nothing here to preserve, migrate, or fix. The ADR-010 defect check specifically called for by `IMPLEMENTATION_PLAN.md` 0.3 therefore has a clean answer: **not applicable — no pre-existing runner found in this repo to carry the defect.**

## Summary

| Area | Finding |
|---|---|
| Docs | Complete, relocated, and now buildable (missing source files added) |
| Database | Cannot confirm drift-free — target Supabase project itself is unconfirmed (§0.2) |
| Edge Function code | None exists; Phase 1 is a clean start, no legacy defect to reconcile |
| Prior real-world artifact | `PromptLibraryV7_2.jsx` — real, working, 77+13 prompts, should inform Phase 2 seed content |

## Open decisions — status update, 2026-07-20

1. **Target Supabase project — RESOLVED.** `prompt-architect-pro` is a separate product (a Prompt Library, distinct from this system). This system is confirmed to be an extension of EAS's Parliament Core, orchestrated by its existing Prime Minister/Workflow Engine, living in `cso-playground` (`urhocsijfzkepebsmstx`) — not a standalone Supabase project. See `docs/21-ADRs/0011-prompt-orchestration-platform-as-parliament-core-extension.md` (repo root `docs/`). This is a materially bigger decision than "which project" — it also retires this system's own control-plane pipeline (`GLOBAL_CONTROL`/`INTAKE_NORMALIZER`/`INTENT_CLASSIFIER`/`WORKFLOW_ROUTER`/`TASK_PLANNER`) in favor of Parliament Core's existing Workflow Engine. `BUILD_SPEC.md` and `DATABASE.md` now carry pointer banners to ADR-0011.
2. **Relationship between the two prompt sources — RESOLVED.** Both were reviewed; the specialist prompts for the three v1 modules were enriched with concrete structures from `PromptLibraryV7_2.jsx`'s matching `PL-XXX` prompts. See `SPECIALIST_PROMPTS_SEED.md`.
3. **Fate of `PromptLibraryV7_2.jsx` — RESOLVED.** Retired. Its useful content was mined into `SPECIALIST_PROMPTS_SEED.md`; duplicate/triplicate copies in `~/Downloads/` were removed. The two content-distinct source files (`PromptLibraryV7.jsx`, `PromptLibraryV7_2.jsx`) remain on disk as historical reference, not deleted.

## New open item, surfaced by ADR-0011 — blocks Phase 1

**Phase 1 needs a re-scoping pass before any migration is written.** ADR-0011 establishes the target architecture (extend `ai_agents`/`prompt_modules`/`workflow_definitions`/`agent_runs`, no fresh 11-table schema, no standalone control plane) but does not itself decide: which of `context_assets`/`routing_rules`/`output_formats`/`validators`/`users`/`task_runs`/`run_steps` become genuinely new tables (additive to the existing schema, name-collision-checked) vs. map onto something that already exists; whether new agents use Anthropic (the existing convention in `cso-playground`, per `prompt_modules.model_provider` defaulting to `'anthropic'`) or introduce OpenAI per `PROMPT_ENGINE.md`'s original design; and the exact shape of the shared Edge Function that will run the new specialist/validator/formatter agents. This is real Phase 1 planning work, not yet done — flagged here rather than guessed at.

**Acceptance gate per `BUILD_SPEC.md` §6: this report's original three decisions are now resolved. Phase 1 remains blocked on the re-scoping pass above until the Product Owner requests it.**
