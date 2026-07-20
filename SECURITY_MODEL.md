# SECURITY_MODEL.md

## 1. Assumption this model depends on

Single-tenant, internal-first (Cvetanichin consultants only) for v1, per `PROJECT.md` §8. If this changes before Phase 4, this document and the RLS migration both need rework before external users touch the system — flag to the project owner immediately if scope shifts, don't quietly extend the current model to cover it.

## 2. Auth

Supabase Auth. `users.user_id` is a foreign key to `auth.users(id)` — there is no separate freestanding identity system. No anonymous access to `orchestrate-task` in any environment beyond local dev.

## 3. Row Level Security

Applied in a dedicated migration (not bundled into `001_init_schema.sql`, so schema and access-control changes are reviewable separately). Baseline policy for internal-first v1:

- `prompt_modules`, `workflows`, `workflow_steps`, `routing_rules`, `output_formats`, `validators`, `context_assets`: readable by any authenticated user (shared prompt library across the practice); writable only by a service-role key used by an internal admin path, not by end-user sessions in v1 (no in-app prompt editing UI yet — that's a Phase 3+ frontend feature, and when it ships, write RLS needs a real per-role policy, not just service-role).
- `projects`: readable/writable by any authenticated user in v1 (small internal team, low risk) — revisit if the team grows past a size where implicit trust stops being reasonable.
- `task_runs`, `run_steps`: readable/writable only by the `user_id` that created them, plus service-role. This one is not optional even at small scale — task run content can include donor-sensitive or client-sensitive material.

## 4. Secrets

`OPENAI_API_KEY` lives in Supabase Edge Function secrets, never in a migration, never in a frontend bundle, never logged (check `logger.ts` and any error message construction doesn't accidentally interpolate it — see `ERROR_HANDLING.md` §4 on client-facing error messages never containing raw provider errors).

## 5. What's explicitly out of scope for v1

- Per-client/per-tenant data isolation beyond `project_id` scoping — there's no multi-org model yet.
- Audit logging beyond what `task_runs`/`run_steps` already provides — no separate security audit log table in v1.
- Rate limiting on `orchestrate-task` — acceptable at internal-team scale; required before any external exposure (Phase 4 hardening should at minimum flag this, even if not implemented).
