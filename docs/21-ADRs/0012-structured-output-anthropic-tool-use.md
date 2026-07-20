---
adr: 0012
title: Schema-Enforced Structured Output via Anthropic Tool Use, Not the OpenAI Responses API
status: Accepted
date: 2026-07-20
amends: ../../apps/prompt-orchestration-platform/docs/ADR/010-openai-integration.md, ../../apps/prompt-orchestration-platform/docs/PROMPT_ENGINE.md, ../../supabase/functions/_shared/llmGateway.ts
---

# ADR-0012: Schema-Enforced Structured Output via Anthropic Tool Use

## Context

ADR-0011 folds Prompt Orchestration Platform's specialist/validator/formatter
modules into Parliament Core's existing Agent Runtime, which calls the
existing `llmGateway.ts` (`generateText`). That gateway is Anthropic-first
(`prompt_modules.model_provider` defaults to `'anthropic'`; every one of the
six agents currently registered — `me-agent`, `compliance-agent`,
`reporting-agent`, `research_ministry`, `writing_ministry`,
`compliance_judge` — runs on `claude-sonnet-4-6`) and Gemini-second, with no
OpenAI adapter at all.

`PROMPT_ENGINE.md` §1's non-negotiable rule — strict, named-JSON-Schema
output for every control-plane-equivalent step (now: `VALIDATOR_GENERIC`,
`VALIDATOR_INDICATORS`, `VALIDATOR_MVP_REALISM`, and any future formatter
that must emit machine-parsed JSON) — was designed around
`ADR/010-openai-integration.md`'s choice of OpenAI's Responses API
(`text.format.type = "json_schema"`, `strict: true`). That mechanism does
not exist on the Anthropic API this deployment actually uses.

Separately, `llmGateway.ts`'s current `generateText` has exactly the defect
ADR-010 was written to fix: it returns raw text, and any parsing is a
caller-supplied `parseResponse` callback applied defensively after the
fact — generic-mode-and-hope, not schema-enforced. This was never exercised
as a real production defect (Parliament Core's existing ministries don't yet
need structured JSON), but it is a real gap the moment a specialist that
must return machine-parsed output (an indicator matrix, an MVP feature
table) is registered.

## Decision

Do not introduce OpenAI as a second live provider for this. Instead, extend
`llmGateway.ts` with a schema-enforced path built on Anthropic's existing
tool-use mechanism — functionally equivalent to OpenAI's strict Structured
Outputs, using the provider this deployment already runs on:

- Add `generateStructured(prompt, schema, options)` alongside the existing
  `generateText`, not replacing it — plain-text agents (donor-narrative
  formatters, some specialist runs per `PROMPT_ENGINE.md` §1's "stays prose"
  list) keep calling `generateText` exactly as today.
- `generateStructured` calls the Anthropic Messages API with a single tool
  definition built from the named JSON Schema and `tool_choice: {type:
  "tool", name: <schema_name>}` — this forces the model to respond via that
  tool call, and the tool call's `input` is already a parsed object, not a
  string requiring `JSON.parse`. This is the same pattern
  `PromptLibraryV7_2.jsx`'s retired "Schema-Driven Structured Output
  Enforcer" prompt (`PL-069`, see `SPECIALIST_PROMPTS_SEED.md`) already
  documents as the correct approach for exactly this failure mode.
- `prompt_modules.strict_output_enabled` (new column, see the Phase 1
  re-scoping plan) is the switch: `true` routes an invocation through
  `generateStructured` with `output_schema_json` as the tool schema; `false`
  or absent keeps using `generateText`.
- Three-layer validation (`PROMPT_ENGINE.md` §6 — schema conformance, parse
  success, semantic guard) still applies on top of this; tool-use enforces
  the first layer at the model boundary, it does not replace the other two.

## Consequences

- `ADR/010-openai-integration.md` is superseded for this deployment's
  provider choice (not for its underlying reasoning — "generic mode with
  defensive parsing is a real weak point" is exactly right, and this ADR
  fixes that same weak point, just on Anthropic instead of OpenAI).
  `PROMPT_ENGINE.md`'s schema-strategy sections (naming/versioning schemas,
  one schema per step type) remain accurate as written — only the transport
  mechanism changes.
- No second provider integration, no second set of API credentials, no
  provider-selection logic to add to any new specialist — every new agent
  registered under ADR-0011 uses the same Anthropic binding every existing
  agent already uses.
- `llmGateway.ts` gains one new exported function and a `GenerateStructuredOptions`
  type; `generateText`'s existing signature and behaviour are unchanged, so
  no existing agent (`me-agent`, `research_ministry`, etc.) is touched by
  this change.
- If a future need for OpenAI-specific capability arises, this ADR does not
  block adding it later as a genuine second provider adapter — it only
  decides that POP's specialists, as currently scoped, don't need it.

## Alternatives considered

- **Add an OpenAI provider adapter to `llmGateway.ts` and route only POP's
  strict-output modules through it.** Rejected: introduces a second billed
  API, a second credential to manage, and a provider-selection branch every
  other part of the system would need to reason about, for a capability
  (schema-enforced output) Anthropic's tool-use already provides.
- **Keep `generateText` + defensive `parseResponse`, same as today.**
  Rejected — this is the literal weak point `PROMPT_ENGINE.md`/ADR-010 exist
  to close; carrying it into every new specialist would reintroduce the
  known defect rather than fix it.
