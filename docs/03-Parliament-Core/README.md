---
status: APPROVED — approved by Product Owner 12 July 2026 — see Parliament-Core-Specification-v1.0.md
eas_reference: EAS v1.0 §3.2 (Layer 2) and §3.3 (Workflow Engine, Agent Runtime), §13 priority 1
---
# 03 — Parliament Core

Full specification: `Parliament-Core-Specification-v1.0.md` — Workflow Engine
(state machine, task queue, retries, scheduling, dependency graph, the Vote of
No Confidence pattern formalised as a reusable sub-workflow) and Agent Runtime
(agent lifecycle, tool permissions, identity/audit binding, LLM Gateway
binding) — the two services that let `pmAgent.js` and `ministryAdapter.js` be
re-platformed instead of rewritten.

The §0 source-grounding caveat is resolved: the real MVP source was found
locally (`~/Downloads/parliamentary-ai-mvp/`) and read in full against this
spec. Verdict: a confirmation, not a redesign — the Vote of No Confidence
threshold default (2), the four human gates, the veto engine's three tiers,
and the Ministry Adapter contract all matched what the spec had already
inferred from the README. Only two of the nine v1 Ministries (Research,
Writing) have existing code; the rest are net-new, built to the Ministry
Adapter contract from scratch.
