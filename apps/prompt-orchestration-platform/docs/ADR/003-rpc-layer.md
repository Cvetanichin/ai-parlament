# ADR-003: RPC Layer for Atomic and Authoritative Operations

**Status:** Accepted

## Context

Some operations need to be atomic across tables (creating and later finalizing a `task_runs` row alongside its `run_steps`), and one operation — workflow resolution — needs to be deterministic and auditable rather than left to an LLM's discretion (see ADR-008).

## Decision

Use Postgres RPC functions (`RPC_REFERENCE.md`) for: `create_task_run`, `record_run_step`, `finalize_task_run`, `resolve_workflow_for_run`. All other reads/writes go through the Supabase client directly from the Edge Function.

## Consequences

- Positive: atomicity guaranteed by Postgres, not application-level transaction juggling; routing logic lives in SQL where it can be reasoned about and changed independently of the Edge Function's TypeScript.
- Negative: a second language (PL/pgSQL) in the stack for these four functions. Accepted — the alternative (multi-statement transactions coordinated from TypeScript) is more failure-prone for exactly the atomicity guarantees these functions exist to provide.

## Alternatives considered

- **Do all writes as direct table operations from TypeScript.** Rejected for `create_task_run`/`finalize_task_run`/`record_run_step` — no need for RPC-level atomicity was actually true, but `resolve_workflow_for_run` specifically needs to be the deterministic authority over the LLM router (ADR-008), and RPC is the natural home for that.
