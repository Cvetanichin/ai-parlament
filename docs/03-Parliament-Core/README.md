---
status: SPECIFIED — DRAFT, pending Product Owner approval — see Parliament-Core-Specification-v1.0.md
eas_reference: EAS v1.0 §3.2 (Layer 2) and §3.3 (Workflow Engine, Agent Runtime), §13 priority 1
---
# 03 — Parliament Core

Full specification: `Parliament-Core-Specification-v1.0.md` — Workflow Engine
(state machine, task queue, retries, scheduling, dependency graph, the Vote of
No Confidence pattern formalised as a reusable sub-workflow) and Agent Runtime
(agent lifecycle, tool permissions, identity/audit binding, LLM Gateway
binding) — the two services that let `pmAgent.js` and `ministryAdapter.js` be
re-platformed instead of rewritten.

One open decision from EAS §14 (Vote of No Confidence failure threshold) has a
recommended resolution in this spec (§2.3.1) — configurable per Workflow
Definition, default 2 — pending Product Owner confirmation.
