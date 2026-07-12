---
status: APPROVED — approved by Product Owner 12 July 2026 — see House-of-Parliament-Specification-v1.0.md
eas_reference: EAS v1.0 §3.1 (House of Parliament)
---
# 10 — House of Parliament (Developer Workspace)

Scope: the internal, non-customer-facing integration and validation environment —
Prompt IDE, Agent Registry, Workflow Builder, Context Viewer, Memory Explorer,
Vector Search console, Live Logs, Confidence Scores, Token Usage, Replay Sessions,
Benchmarking, Veto Debugger, Prompt Diff, Version History, Playground. The current
`frontend/index.html` MVP playground is the seed of this application, not of the
production Ministries Dashboard.

See `House-of-Parliament-Specification-v1.0.md` for the full spec. Resolves
two open items previously tracked against Platform Services (§8) and
Database Schema (§14): institutional memory curation authority/interface,
and the prompt promotion approval interface — both landed on a single new
`profiles.is_platform_operator` flag rather than the existing
Organisation-scoped role field.
