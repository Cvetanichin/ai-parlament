---
document: Phase 1 Re-Scoping Plan
supersedes: IMPLEMENTATION_PLAN.md's original Phase 1 task list (1.1-1.11), per ADR-0011
depends_on: docs/21-ADRs/0011-prompt-orchestration-platform-as-parliament-core-extension.md, docs/21-ADRs/0012-structured-output-anthropic-tool-use.md (repo root docs/)
status: RESOLVED at the planning level (2026-07-20) — all open items in §8 decided. Nothing in this document has been executed yet: no migration applied, no code written, no agent registered. Execution is §7's task list.
prepared: 2026-07-20
---

# Phase 1 Re-Scoping Plan

This is the planning pass ADR-0011 flagged as still needed before Phase 1
can execute. It answers, concretely: which of Prompt Orchestration
Platform's (POP) 11 original tables become new tables vs. reuse what
`cso-playground` already has; what the shared Edge Function looks like;
how structured output actually gets enforced (ADR-0012); and what the
revised Phase 1 task list is. Grounded throughout in the real, currently
deployed code (`supabase/functions/_shared/agentRuntime.ts`,
`workflowEngine.ts`, `llmGateway.ts`) and real live schema (queried directly
against `urhocsijfzkepebsmstx`), not the abstract Parliament Core spec alone.

## 1. Table-by-table disposition

| POP concept (`DATABASE.md`) | Disposition | Why |
|---|---|---|
| `prompt_modules` | **Reuse + extend.** Add columns to the real `prompt_modules` table. | Already the physical `AgentVersion` table (ADR-0007 §3.6). Needs `category`, `domain`, `input_schema_json`, `output_schema_json`, `strict_output_enabled`, `default_output_type`, `tags`, `requires_context` added — none of these collide with its existing 12 columns (`agent_id`, `name`, `content`, `version`, `model_provider`, `model_name`, `status`, `author_id`, `approval_state`, `variables`, `test_cases`, `rolled_back_from`), they're purely additive, same pattern as migration `02`'s original `model_provider`/`model_name`/`status` additions. |
| `workflows` | **Not needed.** POP's four v1/v1.1 workflows become new rows in the existing `workflow_definitions` table. | `workflow_definitions` already holds `states`/`transitions`/`gates` as JSONB — generic by design (Parliament Core §1: "thin and generic... infrastructure every ministry shares"). `execution_pattern`/`primary_domain`/`trigger_keywords` don't need new columns on this shared table — see `routing_rules` below. |
| `workflow_steps` | **Not needed as a table.** Encoded as an enriched shape within `workflow_definitions.transitions` (JSONB, schema-flexible — no migration required for this specifically). | See §3 below for the exact enriched transition shape (adds `agentSlug`, `inputMapping`, `outputKey` per transition, additively, without changing what existing Workflow Definitions already store). |
| `context_assets` | **New table.** | No EAS equivalent (`memory_entries` is institutional-memory-tiered, a different concept). |
| `routing_rules` | **New table.** | No EAS equivalent — this is exactly where `execution_pattern`/`primary_domain`/`trigger_keywords`-style classifier-to-workflow logic belongs, kept off the shared `workflow_definitions` table. |
| `output_formats` | **New table.** | No EAS equivalent. |
| `validators` | **New table.** | No EAS equivalent (`compliance_findings` is a *result* table, not a validator registry). |
| `projects` (POP's own) | **Not needed — reuse the real `projects` table.** | POP's version (`project_id`, `project_name`, `domain`, `default_context_assets`) is a different, thinner concept than EAS's real Project entity, but `agent_runs.project_id` is already `NOT NULL` and references it — every new agent invocation must be tied to a real project regardless. Add `default_context_assets uuid[]` as one additive column on the real `projects` table if per-project default context is genuinely needed; do not create a second "projects" table. |
| `users` | **Not needed — reuse `profiles`.** | EAS's user-identity table is `profiles` (bound to `auth.users`), not a bare `users` table (POP's `DATABASE.md` §4 already flags `users.user_id` as bound to `auth.users(id)` as "a deliberate deviation from the Airtable model" — that deviation is exactly what `profiles` already is). Add `preferences_json jsonb` and `active_project uuid references projects(id)` as additive columns on `profiles` if needed. |
| `task_runs` | **New satellite table**, `prompt_orchestration_runs`, referencing `workflow_instances` 1:1. | `workflow_instances` already tracks state/history/organisation/target — reusing it means POP's runs get Vote-of-No-Confidence-pattern history and Human Gate integration for free. But `workflow_instances` is deliberately domain-agnostic (`target_type`/`target_id` pointing at an *existing* entity like a Proposal) — it has nowhere to hold POP-specific raw content (`user_input`, `normalized_input_json`, `classification_json`, `final_output`). A satellite table holds that content, keyed by `workflow_instance_id`, without polluting the shared table. |
| `run_steps` | **Not needed — already `tasks` + `agent_runs` together.** | `tasks` (ministry, depends_on, status, `agent_run_id`, retry_count) plus `agent_runs` (input_data/output_data/token_cost/latency_ms/status/error_message) is already a complete match for "one row per executed step" — this is not a gap, POP's `run_steps` concept already exists under a different name. |

**Net effect: 5 new tables (`context_assets`, `routing_rules`, `output_formats`, `validators`, `prompt_orchestration_runs`) instead of POP's original 11**, plus additive columns on `prompt_modules`, `projects`, and `profiles`. This is a materially smaller migration than the standalone design — a direct consequence of ADR-0011, not a separate simplification decision.

## 2. Migration DDL sketch (next migration: `17_prompt_orchestration_schema.sql`)

Not applied — sketch only, for review before Phase 1 execution.

```sql
-- Additive columns on the existing Agent Version table.
alter table public.prompt_modules add column if not exists category text
  check (category in ('core','specialist','validator','formatter','utility'));
alter table public.prompt_modules add column if not exists domain text[] not null default '{}';
alter table public.prompt_modules add column if not exists input_schema_json jsonb;
alter table public.prompt_modules add column if not exists output_schema_json jsonb;
alter table public.prompt_modules add column if not exists strict_output_enabled boolean not null default false;
alter table public.prompt_modules add column if not exists default_output_type text
  check (default_output_type in ('text','table','json','memo','doc_ready','spec'));
alter table public.prompt_modules add column if not exists tags text[] not null default '{}';
alter table public.prompt_modules add column if not exists requires_context boolean not null default false;

-- Additive columns on the real Project / Profile entities (ADR-0011 §2).
alter table public.projects add column if not exists default_context_assets uuid[] not null default '{}';
alter table public.profiles add column if not exists preferences_json jsonb;
alter table public.profiles add column if not exists active_project uuid references public.projects(id);

create table public.context_assets (
  id                        uuid primary key default gen_random_uuid(),
  organisation_id           uuid not null references public.organisations(id),
  name                      text not null,
  context_type              text not null check (context_type in (
                              'user_preferences','project_context','template','schema',
                              'style_guide','donor_requirements','domain_rules',
                              'example_output','uploaded_document_summary')),
  domain                    text[] not null default '{}',
  content                   text,
  content_json              jsonb,
  source_reference          text,
  active                    boolean not null default true,
  notes                     text,
  created_at                timestamptz not null default now()
);
alter table public.context_assets enable row level security;
create policy "context_assets_select" on public.context_assets for select
  to authenticated using (true);  -- shared reference data, same pattern as prompt_modules/ai_agents

create table public.routing_rules (
  id                        uuid primary key default gen_random_uuid(),
  rule_name                 text not null,
  priority                  integer not null default 100,
  match_logic_json          jsonb not null,
  selected_workflow_definition_id uuid not null references public.workflow_definitions(id),
  specialist_override_agent_id    uuid references public.ai_agents(id),
  validator_override_agent_id     uuid references public.ai_agents(id),
  formatter_override_agent_id     uuid references public.ai_agents(id),
  active                    boolean not null default true,
  notes                     text
);
alter table public.routing_rules enable row level security;
create policy "routing_rules_select" on public.routing_rules for select
  to authenticated using (true);

create table public.output_formats (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null,
  format_type               text not null check (format_type in ('memo','table','json','spec','doc_ready','slide_outline')),
  description               text,
  formatter_agent_id        uuid references public.ai_agents(id),
  output_schema_json        jsonb,
  notes                     text
);
alter table public.output_formats enable row level security;
create policy "output_formats_select" on public.output_formats for select
  to authenticated using (true);

create table public.validators (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null,
  validator_agent_id        uuid references public.ai_agents(id),
  focus_area                text[] not null default '{}',
  severity_threshold        text not null default 'medium' check (severity_threshold in ('low','medium','high')),
  notes                     text
);
alter table public.validators enable row level security;
create policy "validators_select" on public.validators for select
  to authenticated using (true);

create table public.prompt_orchestration_runs (
  id                        uuid primary key default gen_random_uuid(),
  workflow_instance_id      uuid not null references public.workflow_instances(id) on delete cascade,
  organisation_id           uuid not null references public.organisations(id),
  user_input                text not null,
  normalized_input_json     jsonb,
  classification_json       jsonb,
  selected_context_json     jsonb,
  final_output              text,
  final_output_json         jsonb,
  quality_assessment        text check (quality_assessment in ('strong','acceptable_with_revisions','weak')),
  created_at                timestamptz not null default now()
);
alter table public.prompt_orchestration_runs enable row level security;
create policy "prompt_orchestration_runs_select" on public.prompt_orchestration_runs for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
create policy "prompt_orchestration_runs_insert" on public.prompt_orchestration_runs for insert
  to authenticated with check (organisation_id in (
    select organisation_id from public.organisation_members where user_id = (select auth.uid())));
```

**Why `select using (true)` on the four new registries:** matches the existing RLS shape on `ai_agents`, `prompt_modules`, and `workflow_definitions` exactly (all three already use unconditional `select ... using (true)`) — consistent with the Product Vision's confirmed v1 scope: one Organisation, so shared reference/registry data doesn't need per-org isolation, only actual execution data (`prompt_orchestration_runs`, matching `workflow_instances`/`tasks`/`agent_runs`) does.

## 3. Encoding POP's step sequence inside `workflow_definitions.transitions`

No new table for `workflow_steps` (§1). Each transition gains three optional
fields, additive to the shape already documented in Parliament Core spec
§2.6:

```jsonc
// workflow_definitions.transitions, one new Workflow Definition
// (e.g. name: "Prompt Orchestration - M&E Framework", version: 1)
[
  { "from": "pending", "to": "running", "trigger": "start",
    "agentSlug": null, "outputKey": null },              // Prime Minister dispatches
  { "from": "running", "to": "running", "trigger": "specialist_complete",
    "agentSlug": "specialist_me_framework", "outputKey": "draft_output" },
  { "from": "running", "to": "veto_failed", "trigger": "validator_fail",
    "agentSlug": "validator_indicators", "outputKey": "validation_result" },
  { "from": "running", "to": "running", "trigger": "validator_pass",
    "agentSlug": "validator_indicators", "outputKey": "validation_result" },
  { "from": "running", "to": "completed", "trigger": "formatter_complete",
    "agentSlug": "formatter_table_first", "outputKey": "final_output" }
]
```

`veto_failed` → `rewriting` → `running` → `escalated` → `awaiting_human`
reuse the exact baseline state machine every Workflow Definition already
gets (§2.2) — POP's specialist/validator failure path is not a new state
machine, it's the same Vote of No Confidence pattern every other ministry
already goes through, with `validators` (new table, §1) supplying the
severity threshold that decides pass/fail. **Decided (2026-07-20): reuse
`vetoEngine.ts` directly, not a parallel function — see §3.1.**

### 3.1 Generalizing `vetoEngine.ts` for reuse

`runVeto()` as it exists today is hardcoded to the Writing Ministry's shape:
`agentSlug: "compliance_judge"`, a Governance-Loop-specific
`buildSemanticPrompt` (references "Annex A draft" literally), and
`VetoConstraints` (`characterLimit`, `requiredKeywords`) that don't fit a
validator like `VALIDATOR_INDICATORS` checking SMART-criteria coverage
rather than a character limit. "Reuse the existing veto engine" therefore
means **generalize it, not call it as-is**:

- Extract the three-tier shape into a parameterized `runValidation()`:
  deterministic and lexical become caller-supplied check functions instead
  of the two fixed functions bound to `VetoConstraints`; semantic becomes a
  caller-supplied `semanticJudgeAgentSlug` + `buildSemanticPrompt`, instead
  of being hardcoded to `compliance_judge`.
- `runVeto()` stays exported with its exact current signature, reimplemented
  as a thin wrapper calling `runValidation()` with the existing
  `deterministicCheck`/`lexicalCheck`/`compliance_judge`/
  `buildSemanticPrompt` bound in — **zero behaviour change for
  `runGovernanceLoop`'s existing call site.**
- `VALIDATOR_INDICATORS` (and `VALIDATOR_GENERIC`, `VALIDATOR_MVP_REALISM`
  when they're seeded) call `runValidation()` directly with their own
  deterministic check (e.g. "every indicator row has a non-empty MoV
  field"), their own semantic judge agent slug (a new, deliberately
  separate persona per agent — same "different role from the drafting
  agent" principle `compliance_judge` already establishes), and severity
  drawn from the new `validators.severity_threshold` column rather than a
  fixed pass/fail.
- This is real refactoring work on a file the live Writing Ministry depends
  on today — it needs a regression test proving `runGovernanceLoop`'s
  behaviour is unchanged before any new validator is wired to
  `runValidation()`, not just a new-code test.

## 4. LLM Gateway extension (ADR-0012)

`supabase/functions/_shared/llmGateway.ts` gains `generateStructured()`
alongside the existing `generateText()` — see ADR-0012 for the full
rationale. Signature sketch (not final code):

```ts
export interface GenerateStructuredOptions {
  binding: ModelBinding;
  schemaName: string;
  schema: Record<string, unknown>;  // prompt_modules.output_schema_json
  mock: () => Record<string, unknown>;
}
export async function generateStructured(
  prompt: string,
  options: GenerateStructuredOptions,
): Promise<{ output: Record<string, unknown>; tokenCost: number | null; latencyMs: number; usedProvider: string }>
```

`agentRuntime.ts`'s `invokeAgent()` needs one new branch: when the resolved
`prompt_modules` row has `strict_output_enabled = true`, call
`generateStructured` with `output_schema_json` instead of `generateText` —
everything else in `invokeAgent` (the `ai_agents` lookup, the `agent_runs`
insert, the return shape) stays as-is.

## 5. New agents to register (Phase 2 seed content already written)

Using `ensureAgent`/`ensureActivePromptVersion` (`agentRuntime.ts`, already
exist, idempotent) — no new registration mechanism needed, same calls
`research_ministry`/`writing_ministry` already went through:

| `ai_agents.slug` | `edge_function` | Prompt source |
|---|---|---|
| `specialist_me_framework` | `prompt-orchestration-run` (new, §6) | `SPECIALIST_PROMPTS_SEED.md` §1 |
| `specialist_product_mvp` | `prompt-orchestration-run` | `SPECIALIST_PROMPTS_SEED.md` §2 |
| `specialist_prompt_engineering` | `prompt-orchestration-run` | `SPECIALIST_PROMPTS_SEED.md` §3 |
| `validator_indicators` | `prompt-orchestration-run` | `04_PromptLibrary_SystemPromptsStructure.md` §18 (unreviewed by the seed-content pass — that pass covered specialists only; review before seeding) |
| `formatter_table_first` | `prompt-orchestration-run` | `04_PromptLibrary_SystemPromptsStructure.md` §21 (same caveat) |

All five share one `edge_function` value, following the live precedent that
`writing_ministry` and `compliance_judge` both already point at
`workflow-governance-run` — one function, multiple registered agents,
disambiguated by which `agentSlug` the caller passes.

**Not registered as agents** (per ADR-0011 §3): `GLOBAL_CONTROL`,
`INTAKE_NORMALIZER`, `INTENT_CLASSIFIER`, `WORKFLOW_ROUTER`, `TASK_PLANNER`,
`RUN_LOGGER`. Their responsibilities are the new Workflow Definition's
`states`/`transitions` plus the Prime Minister's existing task-allocation
role — not callable agents.

**Correction, 2026-07-20 (see §5.2): this was too categorical for two of the
six.** `INTAKE_NORMALIZER` and `INTENT_CLASSIFIER` genuinely call a model —
ADR-0011's own principle 8 ("auditable by construction") requires every
model call go through the Agent Runtime, so both **are** registered agents
after all. The other four (`GLOBAL_CONTROL`, `WORKFLOW_ROUTER`,
`TASK_PLANNER` for v1, `RUN_LOGGER`) correctly have no model call of their
own — ADR-0011's reasoning holds for them unchanged.

### 5.1 `GLOBAL_CONTROL`'s final form — decided (2026-07-20)

Not a `prompt_modules` row, not an `ai_agents` row, not a hardcoded string in
application code (that would break `PROJECT.md` Golden Rule 1 — this
system's content-governance rules survive ADR-0011 unchanged; only the
orchestration mechanism changed). **`GLOBAL_CONTROL` becomes one
`context_assets` row** — `context_type = 'domain_rules'`, `domain =
'{general}'`, `content` = its prose text from
`04_PromptLibrary_SystemPromptsStructure.md` §2 (lines 1442–1484). The new
`prompt-orchestration-run` function fetches this one row once per
orchestration run (not once per specialist call) and prepends it to every
specialist/validator/formatter prompt it builds — matching how the original
design already described it ("prose, always injected as system-level
context — not a discrete billed step," `EDGE_FUNCTIONS.md` step 2). Editable
by a Product Owner through the `context_assets` table like any other
context asset, with zero code deploy, per `PROJECT.md` Golden Rule 7.

### 5.2 Classification and routing — decided (2026-07-20)

**Recommendation: split the two concerns, as POP's own original design
already did, and keep each on the side it's actually good at.** These are
not one question with one answer — `INTENT_CLASSIFIER` and
`WORKFLOW_ROUTER` were two different jobs wearing similar names.

**`INTENT_CLASSIFIER` (and `INTAKE_NORMALIZER` before it): stays an LLM
call, registered as a real agent.** Classifying arbitrary free text
("can you help me draft indicators for the new EU project?") into
`primary_task_type`/`domain`/`complexity`/`risk_flags` needs genuine
language understanding — deterministic keyword-matching is brittle the
moment phrasing varies, which for a consultant's actual input it always
will. This is exactly the shape `generateStructured` (ADR-0012, §4) exists
for: a named schema, forced conformance, bounded enum outputs. Concretely:

- `intake_normalizer` and `intent_classifier` become two more `ai_agents`
  rows (correcting §5's original "not registered as agents" list — see the
  note there), sharing `prompt-orchestration-run` like the other five.
- Their prompt text is `04_PromptLibrary_SystemPromptsStructure.md` §3 and
  §4 respectively (`intake_normalizer_v1` / `intent_classifier_v1` schemas
  already fully specified in `PROMPT_ENGINE.md` §3) — seed as-is, they
  don't need the same real-world enrichment pass the specialists got,
  since classification prompts aren't domain-content prompts.
- Each call is audited through the normal `agent_runs` path — same
  auditability guarantee every other agent invocation already gets.

**Routing (which Workflow Definition to instantiate): NOT an LLM call —
a deterministic Postgres function against `routing_rules`.** Once
`intent_classifier` has produced structured signals, mapping those signals
to a `workflow_definition_id` is a lookup with no ambiguity requiring
judgment: match `routing_rules.match_logic_json` against the classification
output, ordered by `priority`, return the first match. This is exactly
where `docs/18-Testing/`'s "deterministic-rule-coverage-first" philosophy
applies with full force — 100% branch coverage on a routing table is
achievable and meaningful in a way it never can be on free-text
classification.

**Consequence: `WORKFLOW_ROUTER` as a separate LLM call is dropped
entirely, not just left unregistered.** POP's original design already
made the RPC result authoritative and the LLM router's output
rationale-only, logging-only (`EDGE_FUNCTIONS.md` step 6: "RPC result is
authoritative"). A second model call whose output is admittedly never
acted on is pure latency and token cost for no decision-making value — the
deterministic routing function should write its own match reasoning into
`workflow_instance_history.reason` (which fields of `routing_rules` matched
and why), giving equivalent audit trail without the redundant call. This is
a simplification enabled by removing `WORKFLOW_ROUTER`, not a separate cut
that loses something.

**`TASK_PLANNER`: deferred, not eliminated.** All three v1 workflows
(`ME_FRAMEWORK`, `PRODUCT_MVP_DESIGN`, `PROMPT_ENGINEERING`) use
`sequential_chain` (`BUILD_SPEC.md` §1, confirmed in `ARCHITECTURE.md` §3:
"v1 workflows... all use `sequential_chain`") — a fixed step sequence
already fully specified by the Workflow Definition's `transitions` (§3).
There is nothing for a planner to dynamically decide yet. `TASK_PLANNER`
becomes relevant only when a `planner_plus_workers` workflow is actually
built (v1.1+, e.g. a future multi-part deliverable) — correctly deferred,
not a registered agent for Phase 1, and this isn't a gap: there's no
dynamic planning need to fill.

## 6. Edge Function: `prompt-orchestration-run`

New function, one per this system (not one per module — §5). Structurally
mirrors `workflow-governance-run/index.ts` (read; see file for the real
pattern): validates the request body, loads the `workflow_instances` row,
checks a state precondition, dispatches to a new shared sequencing function
in `workflowEngine.ts` (e.g. `runPromptOrchestrationTask`, analogous to
`runGovernanceLoop`) that calls `invokeAgent` for the specialist, then the
validator, then the formatter, writing to `prompt_orchestration_runs` and
`workflow_instance_history` throughout. Per-specialist `buildPrompt`/
`parseResponse` functions live in new
`supabase/functions/_shared/ministries/promptOrchestration/*.ts` files,
one per specialist — same shape as `ministries/research.ts` and
`ministries/writing.ts` (`buildPrompt`, `mockRun`, `parseResponse`).

This function and `runPromptOrchestrationTask` are genuine Phase 1
implementation work — not written as part of this planning pass.

## 7. Revised Phase 1 task list

Replaces `IMPLEMENTATION_PLAN.md`'s original 1.1–1.11.

- [ ] 1.1 Migration `17_prompt_orchestration_schema.sql` — the DDL in §2 above, reviewed and adjusted, then applied via `apply_migration` to `cso-playground` (not a fresh project — ADR-0011).
- [ ] 1.2 `llmGateway.ts`: add `generateStructured()` (ADR-0012, §4 above). Unit test against a mock binding.
- [ ] 1.3 `agentRuntime.ts`: `invokeAgent()` branches on `prompt_modules.strict_output_enabled` to call `generateStructured` instead of `generateText`.
- [ ] 1.4 Register the 7 agents (§5's 5 + §5.2's `intake_normalizer`/`intent_classifier`) via `ensureAgent`/`ensureActivePromptVersion` — a seed script or one-time call, not new registration code.
- [ ] 1.4b Seed the `GLOBAL_CONTROL` `context_assets` row (§5.1).
- [ ] 1.4c `resolve_workflow_for_run`-equivalent Postgres function — deterministic routing per §5.2, matching classification output against `routing_rules.match_logic_json` by priority.
- [ ] 1.5 New Workflow Definition rows for `ME_FRAMEWORK`, `PRODUCT_MVP_DESIGN`, `PROMPT_ENGINEERING` (v1) — `states`/`transitions`/`gates` per §3's shape.
- [ ] 1.5b Seed `routing_rules` rows mapping each v1 workflow's trigger conditions to its `workflow_definition_id`.
- [ ] 1.6 `vetoEngine.ts` → `runValidation()` generalization per §3.1, with a regression test proving `runGovernanceLoop` is unchanged, before any new validator is wired to it.
- [ ] 1.7 `_shared/ministries/promptOrchestration/*.ts` — `buildPrompt`/`parseResponse` per specialist/validator/formatter/classifier, sourced from `SPECIALIST_PROMPTS_SEED.md` (specialists), `04_PromptLibrary_SystemPromptsStructure.md` §3/§4 (`intake_normalizer`/`intent_classifier`, verbatim per `PROMPT_ENGINE.md` §3's schemas) and §18/§21 (validator/formatter — review before seeding, flagged in §5).
- [ ] 1.8 `workflowEngine.ts`: `runPromptOrchestrationTask()` — sequencing function, §6.
- [ ] 1.9 `supabase/functions/prompt-orchestration-run/index.ts` — the Edge Function, §6.
- [ ] 1.10 Unit + integration tests (`TESTING_STRATEGY.md` §1–2, adjusted for this schema) — including the §1.6 regression test and full branch coverage on the §1.4c routing function per `docs/18-Testing/`'s deterministic-rule-coverage-first philosophy.

**Acceptance gate (unchanged in spirit from the original):** the M&E
Framework workflow runs end-to-end against `cso-playground` — specialist
output validates against its schema, a `prompt_orchestration_runs` row and
matching `workflow_instance_history` rows are written, each new piece has a
passing test.

## 8. Open items — resolved 2026-07-20

All three items originally flagged here are now decided:

- **Validators reuse `vetoEngine.ts`** — generalized into `runValidation()`,
  §3.1.
- **`GLOBAL_CONTROL`** — one `context_assets` row, fetched once per run,
  §5.1.
- **Classification vs. routing** — split, not one answer: classification
  (`intake_normalizer`, `intent_classifier`) stays an LLM call and both
  become real registered agents (correcting §5's original blanket
  "no agents" list); routing becomes a deterministic Postgres function
  against `routing_rules`, and the separate `WORKFLOW_ROUTER` LLM call is
  dropped entirely rather than kept as a non-authoritative rationale step.
  §5.2.

Nothing is left open at the planning level. Task list: §7. Remaining
unknowns (exact test fixture data, precise `match_logic_json` shape for the
three v1 routing rules) are normal implementation detail, not architecture
decisions — they surface during §7's execution, not before it.
