---
status: SPECIFIED (infrastructure target decided; deployment runbook detail not yet specified)
eas_reference: EAS v1.0 §3.4 (Layer 4)
related_adrs: ../21-ADRs/0006-vector-store-pgvector.md, ../21-ADRs/0007-supabase-as-layer-4-backbone.md
---
# 15 — Infrastructure

**Infrastructure target is decided (ADR-0007):** the platform runs on the
existing Intelligence Workspace Supabase project — PostgreSQL (with
`pgvector`, ADR-0006), Auth, Storage, and Edge Functions. There is no
separate PostgreSQL instance and no separate vector database service to
provision. This is the single Layer 4 backbone for both Intelligence
Workspace's existing product and every new Parliamentary AI Ecosystem
service (Workflow Engine, Regulatory Knowledge Layer, Grant Studio domain).

**Mandatory deployment discipline (ADR-0007's mitigation, not optional):**
every migration in `docs/11-Database-Schema/` that touches a real, live
table is applied to a Supabase branch (or a cloned staging project) first,
validated, then promoted. This is because the target project serves a live,
billed product — a migration error here is a production incident, not a
sandbox rollback. `docs/19-Deployment/` owns the concrete runbook for this
workflow; it must exist and be followed before the first `docs/11-` §1
(multi-tenancy) migration is written.

Remaining scope not yet specified: environment naming (local → staging →
pilot → GA) beyond the Supabase-branch mechanism itself, CI/CD pipeline
detail for the Edge Functions, secrets management for the LLM Gateway's
provider API keys, and whether a Redis/queue layer is needed for the
Workflow Engine's task dispatch (Parliament Core spec §3) or whether
Supabase's built-in primitives (Realtime, pg_cron, Edge Function triggers)
are sufficient at v1 scale — recommendation pending, likely the latter
given team size and current traffic, to be confirmed when this section is
written up in full.
