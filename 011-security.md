# ADR-011: Internal-First Security Model with RLS Scoped by Ownership

**Status:** Accepted

## Context

v1 serves Cvetanichin consultants only, not external clients. Security investment should match this scope — enough to protect client/donor-sensitive run data, not a full multi-tenant hardening pass.

## Decision

Supabase Auth for identity; RLS applied in a dedicated migration; `task_runs`/`run_steps` scoped strictly to their creating `user_id`; shared prompt-library tables (`prompt_modules`, `workflows`, etc.) readable by any authenticated user, writable only via service-role until a proper admin UI and role model exist. Full detail: `SECURITY_MODEL.md`.

## Consequences

- Positive: protects the data that actually carries sensitivity risk (run content) without over-building access control for a small internal team.
- Negative: no per-role write permissions on the shared library yet — any authenticated user with direct DB access (not through the app) could theoretically read all prompts/workflows. Acceptable at current trust level; explicitly flagged as needing rework before external exposure.

## Alternatives considered

- **Full multi-tenant RLS from day one.** Rejected — no current requirement, adds complexity now for a need that may not materialize as described. Revisit immediately if external client access is scoped in (`PROJECT.md` §8 flags this explicitly).
