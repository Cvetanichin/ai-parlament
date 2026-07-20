---
adr: 0011
title: Prompt Orchestration Platform Absorbed as New Parliament Core Ministries, Not a Standalone System
status: Accepted
date: 2026-07-20
amends: ../03-Parliament-Core/Parliament-Core-Specification-v1.0.md §3.6, ../11-Database-Schema/, ../../apps/prompt-orchestration-platform/docs/BUILD_SPEC.md, ../../apps/prompt-orchestration-platform/docs/DATABASE.md
---

# ADR-0011: Prompt Orchestration Platform Absorbed as New Parliament Core Ministries

**Accepted by Product Owner, 2026-07-20**, via direct confirmation that
Prompt Orchestration Platform (POP) should be "a space where the AI agents
will work and live, orchestrated by the main Orchestrator (Prime Minister in
EAS concept)" — resolved, when offered the concrete technical choice, as
**real integration**: POP's control plane is replaced by Parliament Core's
existing Workflow Engine and Agent Runtime, and POP lives inside the
`cso-playground` Supabase project as an extension of EAS, not as a separate
product with its own database.

## Context

Earlier the same day, a full specification for "Prompt Orchestration
Platform" was uploaded to this repository as a standalone system: its own
`BUILD_SPEC.md`/`DATABASE.md` (an 11-table schema — `prompt_modules`,
`workflows`, `workflow_steps`, `context_assets`, `routing_rules`,
`output_formats`, `validators`, `projects`, `users`, `task_runs`,
`run_steps`), its own control-plane pipeline (`GLOBAL_CONTROL` ->
`INTAKE_NORMALIZER` -> `INTENT_CLASSIFIER` -> `WORKFLOW_ROUTER` ->
`TASK_PLANNER` -> specialist -> validator -> formatter -> `RUN_LOGGER`), and
its own single Edge Function (`orchestrate-task`). A repo audit (see
`apps/prompt-orchestration-platform/docs/RECONCILIATION_REPORT.md`)
confirmed this spec has zero cross-references to EAS in either direction and
was written as a genuinely independent product.

That independence is what this ADR reverses. Parliament Core
(`docs/03-Parliament-Core/`) already solves exactly the problem POP's
control plane re-specifies from scratch: sequencing work across named
agents, retrying on failure with a bounded threshold (Vote of No
Confidence), pausing for human sign-off at defined points (Human Gates), and
recording every invocation for audit. Building POP's own `WORKFLOW_ROUTER`/
`TASK_PLANNER`/`orchestrate-task` pipeline alongside Parliament Core's
Workflow Engine and Agent Runtime would mean maintaining two orchestration
mechanisms doing the same job, with two audit trails and two retry
policies, inside two different Supabase projects for the same company's
work.

The physical-mapping precedent for this decision already exists: ADR-0007
§3.6 established that Parliament Core's `Agent`/`AgentVersion`/
`AgentInvocation` concepts are not new tables to create but are physically
`ai_agents`/`prompt_modules`/`agent_runs` — the live, pre-existing tables in
`cso-playground`, extended additively. This ADR applies that same pattern
one layer up: POP's `SPECIALIST_*`/`VALIDATOR_*`/`FORMATTER_*` modules
become new **Agents** (new `ai_agents` rows, new ministries) registered
against the same Agent Runtime, not a parallel registry in a parallel
schema.

## Decision

1. **No separate Supabase project.** `prompt-architect-pro`
   (`boiqtfoymcmdgqnfkzjd`) is confirmed to be a distinct product — a Prompt
   Library, not this system — and is not POP's target. POP's target is
   `cso-playground` (`urhocsijfzkepebsmstx`), the same project Parliament
   Core already runs in.

2. **No separate 11-table schema.** POP's module registry becomes new
   `ai_agents` + `prompt_modules` rows (physically the same tables Parliament
   Core's `research_ministry`/`writing_ministry`/`compliance_judge` already
   use — see the live schema: `ai_agents.slug`/`edge_function`/
   `allowed_tools`, `prompt_modules.content`/`agent_id`/`model_provider`/
   `model_name`/`status`/`approval_state`). Genuinely new POP concepts with
   no EAS equivalent (`routing_rules`, `context_assets`, `output_formats`,
   `validators` as a distinct registry, `task_runs`/`run_steps` beyond what
   `agent_runs` already captures) still need new tables, additive to the
   existing schema — the exact shape of those tables is Phase 1 design work,
   not decided by this ADR, and must avoid the naming collisions already
   flagged in the reconciliation report (POP's own `prompt_modules` and
   `projects` names cannot be reused verbatim — they already mean something
   different in this schema).

3. **No separate control-plane pipeline.** `GLOBAL_CONTROL`,
   `INTAKE_NORMALIZER`, `INTENT_CLASSIFIER`, `WORKFLOW_ROUTER`,
   `TASK_PLANNER`, and `RUN_LOGGER` are not built as POP's own modules.
   Their jobs are already Parliament Core's jobs: intake/classification/
   routing is a new Workflow Definition's initial states and transitions
   (`docs/03-Parliament-Core/` §2.2, §2.6), planning-and-dispatch is the
   Prime Minister's existing task-allocation responsibility (§2.8 point 2),
   and run logging is what `agent_runs` plus `workflow_instance_history`
   already do. Whether any of POP's five control-plane prompt texts survive
   as a *new Workflow Definition's* configuration (e.g. its `transitions`
   JSON) rather than as a callable Agent is a Phase 1 design question, not
   resolved here — but none of them get their own `ai_agents` row, because
   none of them are a ministry capability; they are what the Workflow
   Engine already does structurally.

4. **What does become new Agents:** the specialist, validator, and
   formatter modules — `SPECIALIST_ME_FRAMEWORK`, `SPECIALIST_PRODUCT_MVP`,
   `SPECIALIST_PROMPT_ENGINEERING` (v1), later
   `SPECIALIST_NGO_PROJECT_DESIGN`/`SPECIALIST_GRANT_CONCEPT`/
   `SPECIALIST_ADVOCACY_STRATEGY`/`SPECIALIST_RESEARCH_SYNTHESIS`/
   `OPTION_GENERATOR` (v1.1), `VALIDATOR_GENERIC`/`VALIDATOR_INDICATORS`/
   `VALIDATOR_MVP_REALISM`, and `FORMATTER_TABLE_FIRST`/
   `FORMATTER_DONOR_READY`/`FORMATTER_JSON` — these genuinely are ministry-
   style capabilities (one prompt, one job, invoked by the Workflow Engine),
   exactly the shape Parliament Core's Agent Runtime already exists to run.
   Their prompt text is the improved seed content in
   `apps/prompt-orchestration-platform/docs/SPECIALIST_PROMPTS_SEED.md`
   (already produced, folding in real-world content mined from the retired
   `PromptLibraryV7_2.jsx` prompt library per Product Owner direction), not
   the plainer drafts in `04_PromptLibrary_SystemPromptsStructure.md`.

5. **Edge Function reuse, not thirteen new functions.** The live schema
   already shows one Edge Function serving multiple `ai_agents` rows
   (`writing_ministry` and `compliance_judge` both run through
   `workflow-governance-run`). Phase 1 should design one generic Edge
   Function for POP's new specialist/validator/formatter agents (e.g.
   `prompt-orchestration-run`, keyed by `agent_id`/`prompt_module_id`) rather
   than one function per module, consistent with this existing pattern.

## Consequences

- `apps/prompt-orchestration-platform/docs/BUILD_SPEC.md` §2's target
  repository structure (a standalone `supabase/functions/orchestrate-task/`
  with its own `types.ts`/`schemas.ts`/`openai.ts`/`routing.ts`/etc.) and
  `DATABASE.md`'s full 11-table `001_init_schema.sql` are **superseded for
  the orchestration layer** by this ADR. Both documents remain useful as a
  record of the module registry, prompt contracts, and validation design —
  they are not being deleted or declared wrong — but neither should be
  implemented as originally written. A Phase 1 planning pass needs to
  produce the actual reconciled migration plan (which POP concepts get new
  tables vs. reuse `ai_agents`/`prompt_modules`/`workflow_definitions`/
  `workflow_instances`/`tasks`/`agent_runs`) before any migration is
  written — flagged in `IMPLEMENTATION_PLAN.md`, not resolved by this ADR.
- `PROMPT_ENGINE.md`'s strict-Structured-Outputs design (named JSON Schema,
  `strict: true`, three-layer validation) is **not** superseded — it's a
  property of how an individual Agent's prompt is called, orthogonal to
  which system orchestrates the calling. It still applies to however the
  new specialist/validator/formatter Agents are actually invoked.
- ADR-010 (OpenAI Responses API, single provider) needs re-examination in
  Phase 1: `cso-playground`'s existing `prompt_modules.model_provider`
  defaults to `'anthropic'` (Claude), not OpenAI, for every existing agent.
  Whether POP's new agents follow the existing convention (Anthropic) or
  introduce OpenAI as a second live provider in this project is a Phase 1
  decision this ADR does not make.
- `prompt-architect-pro` is confirmed out of scope for this system entirely
  — it is not resumed, inspected, or migrated into as part of this decision.
- This is an amendment to `docs/03-Parliament-Core/` in the sense that it
  adds new ministries to the roster (EAS §3.2's Ministry Library gains a
  prompt-orchestration ministry family) — no change to Parliament Core's
  own Workflow Engine or Agent Runtime mechanics is required; they already
  support this by design (§1: "infrastructure every current and future
  ministry shares").

## Alternatives considered

- **POP as originally specified: a fully independent system** (own Supabase
  project, own 11-table schema, own control-plane pipeline). This was the
  status quo as of this morning's upload. Rejected per Product Owner
  direction — it would duplicate Parliament Core's orchestration guarantees
  (Vote of No Confidence, Human Gates, audited Agent Invocations) rather
  than reusing them, and would require operating and reconciling two
  separate orchestration systems for what is, in substance, more ministries
  doing the same kind of work EAS's existing ministries already do.
