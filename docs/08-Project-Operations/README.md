---
status: APPROVED — approved by Product Owner 12 July 2026 — see Project-Operations-Specification-v1.0.md (v1.1)
eas_reference: EAS v1.0 §5, §8 (Existing Asset Integration Map)
---
# 08 — Project Operations (Post-Award)

Full specification: `Project-Operations-Specification-v1.0.md` — grounded
directly in the real Intelligence Workspace codebase (the connected
`FigmaProjects-main` folder: live Supabase schema, four edge functions), not
a description of it. Confirms the integration approach from ADR-0004 and
surfaces three real gaps against the governed architecture: no Workflow
Engine/veto/human-gate layer in front of the existing agent runs, no
multi-tenancy concept in the live schema, and a Prompt Registry table that
exists but is never actually queried.

**Following ADR-0007 (Accepted):** this spec is no longer conditional. It
confirms Consortium Builder's post-award tables (ADR-0001), a
backward-compatible multi-tenancy migration (ADR-0005) with a decided
Organisation boundary (one tenant per consultancy at v1), the Agent Runtime
extension of `ai_agents`/`prompt_modules`/`agent_runs`, and a permanent
dual-path governance model — internal fast-path generation stays ungoverned,
donor/partner-facing outputs route through a Human Gate via a new
`reports.submission_status` field. All four originally open items (§8) are
now resolved; see the spec for the reasoning behind each.
