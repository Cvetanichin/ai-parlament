---
status: absorbed into Parliament Core — see ADR-0011
eas_reference: ../../../docs/21-ADRs/0011-prompt-orchestration-platform-as-parliament-core-extension.md
---
# Prompt Orchestration Platform — docs

Prompt Orchestration Platform (POP) was originally planned as its own
standalone system (separate Supabase project, own control-plane, own Edge
Function). **ADR-0011 decided against that**: POP's specialist/validator/
formatter modules became new `ai_agents`/`prompt_modules` rows sharing
Parliament Core's existing Workflow Engine/Agent Runtime and one Edge
Function (`prompt-orchestration-run`), in the same `cso-playground`
Supabase project as everything else. What actually got built lives in
`supabase/functions/prompt-orchestration-run/` and
`supabase/functions/_shared/ministries/promptOrchestration/`.

**Files still in active use** (referenced directly, by path, from code
comments in the deployed migrations/Edge Functions — do not move or
rename without updating those references):

- **`PHASE1_RESCOPING.md`** — the real Phase 1 plan actually followed,
  written after ADR-0011 to re-scope the original standalone design onto
  Parliament Core.
- **`04_PromptLibrary_SystemPromptsStructure.md`** — the source prompt
  library; several specialist prompts are seeded verbatim from specific
  sections of it.
- **`SPECIALIST_PROMPTS_SEED.md`** — the improved specialist prompt content
  actually seeded into `prompt_modules`, mined from the now-retired
  `PromptLibraryV7_2.jsx` (77-prompt independent library, reviewed and
  retired per Product Owner instruction — its useful content lives on here,
  not as a separate system).
- **`PROMPT_ENGINE.md`** — the schema-enforcement design; ADR-0012 replaced
  its OpenAI-specific transport mechanism with Anthropic tool-use, but its
  rollout order and per-module schema shape are still the live reference
  (`agentRuntime.ts`, the Phase 1 seed migration both cite it directly).

**Everything else** describes the standalone system as originally
designed — before ADR-0011 — and was never built that way. Archived in
[`_superseded/`](_superseded/README.md) rather than deleted, since two of
those files are still named as amendment targets in ADR-0012's own
front-matter and the rest remain useful history of what the original
design looked like before it was re-scoped.
