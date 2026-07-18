---
document: Architecture Decision Record
id: ADR-0010
title: Embedding Provider and Shared Embedding Pipeline
status: APPROVED — approved by Product Owner, logged alongside ADR-0009
owner: Vas (Product Owner)
architect: Claude (Chief Systems Architect, Claude Cowork)
implementer: Claude Code (Lead Developer) — implements only once status: APPROVED
relates_to: EAS v1.0 §3.3 (Knowledge Platform, Regulatory Knowledge Layer), §3.4 (LLM Gateway), ADR-0006 (pgvector)
---

# ADR-0010 — Embedding Provider and Shared Embedding Pipeline

## 1. Context

Five tables carry an `embedding vector(1536)` column — `regulatory_clauses`, `knowledge_chunks`, `knowledge_documents`, `opportunities`, `memory_entries` — all currently `NULL` on every row. The `1536` dimension was fixed at migration time with no recorded provider decision. Semantic search does not work anywhere on the platform today, including the 75 Regulatory Knowledge Layer clauses now confirmed and ready to be searched.

No embedding provider credential is available outside a properly deployed edge function. Generating embeddings via an ad hoc script with a manually-supplied key would bypass the vendor-neutrality principle (EAS §2.5: *"No ministry or service calls an LLM provider directly"*) and produce untracked, unaudited API calls — exactly what the Observability & Cost Service exists to prevent.

## 2. Decision

**Provider: OpenAI, `text-embedding-3-small`, 1536 dimensions.**

Rationale:
- Matches the existing schema exactly — zero migration needed on any of the five tables.
- Materially cheaper than `text-embedding-3-large` at a quality level that's more than sufficient for clause/document retrieval (this is a citation-retrieval task, not a fine-grained semantic-similarity research task).
- Multilingual-capable, relevant given the Regulatory Knowledge Layer will eventually ingest non-English organisational policy and potentially national law.

**Access path: a narrow, single-purpose Embedding Gateway — not a dependency on the full multi-provider LLM Gateway.**

The EAS treats the LLM Gateway (Layer 4) as the mandatory single entry point for all model calls, but that gateway does not exist yet, and building its full multi-provider chat-completion abstraction is not a prerequisite for something as narrow as "turn text into a vector." This ADR authorises a standalone `embedding-pipeline-run` edge function as the sole caller of the embedding provider, satisfying the vendor-neutrality principle at a scope appropriate to the task. When the full LLM Gateway is eventually built, this function's provider call is refactored to route through it — this is a planned migration path, not a permanent exception.

**Provenance is tracked, not assumed.** Every embedded row must record which model produced its vector and when, so a future provider or model change is a detectable, auditable event rather than a silent inconsistency.

## 3. Schema Addition (Additive Only)

Two columns added to each of the five embedding-bearing tables:

| Column | Type | Purpose |
|---|---|---|
| `embedding_model` | `text` | e.g. `'text-embedding-3-small'`. Null while `embedding` is null. |
| `embedded_at` | `timestamptz` | When the embedding was generated. Null while `embedding` is null. |

This is a `docs/11-Database-Schema/` follow-on (§17 or next available section), staged and validated per ADR-0007's discipline before touching production.

## 4. Open Item Deliberately Not Resolved Here

Whether re-embedding is required when clause `text` is edited after initial embedding is a Knowledge Platform / Regulatory Knowledge Layer editorial workflow question, not an embedding-pipeline architecture question. The pipeline spec (§5 below) supports re-embedding on demand; *when* that should trigger automatically is left to the review-workflow spec.

---

# Edge Function Specification — `embedding-pipeline-run`

```
status: APPROVED — approved by Product Owner
layer: Layer 3, Platform Services (shared library, per EAS §3.3 — Knowledge Platform
       and Regulatory Knowledge Layer share this pipeline rather than duplicating it)
```

## 5. Purpose

A single shared edge function that embeds text from any of the five embedding-bearing tables and writes the resulting vector back to the source row. Callable in three modes: single-row (event-driven), batch backfill, and manual (House of Parliament testing).

## 6. Non-Negotiable Constraints

- **Never publicly callable.** `verify_jwt: true`, and additionally restricted to `service_role` or `profiles.is_platform_operator = true` callers — no end-user-facing invocation path exists. (This is a direct lesson from the `proposal-agent` incident earlier in this project: authenticated is not the same as appropriately scoped.)
- **The provider API key lives in Supabase Vault**, referenced as an environment secret inside the function. It is never passed as a parameter, logged, or returned in any response.
- **Every invocation is audited.** A row is written to `audit_events` (`actor_type = 'system'`, `action = 'embedding_generated'`) per batch, not per row — batch-level granularity is sufficient and keeps the audit table from being dominated by embedding noise.
- **Token cost is tracked.** Feeds the same `cost_rollups` mechanism already used for `agent_runs`, scoped by `scope_type = 'platform_service'` (a value this ADR adds to that check constraint) rather than forcing embedding cost into a ministry/project/proposal bucket it doesn't belong to.

## 7. Input Contract

```json
{
  "mode": "single | backfill | manual",
  "source_table": "regulatory_clauses | knowledge_chunks | knowledge_documents | opportunities | memory_entries",
  "target_ids": ["uuid", "..."],       // required for mode = single or manual; omitted for backfill
  "force_reembed": false,               // default false — skips rows with a non-null embedding unless true
  "batch_size": 40                      // default 40; upper bound enforced server-side, not client-settable above it
}
```

**Text field per source table** (the function must know which column to read — this is fixed mapping logic, not a caller-supplied parameter, to prevent embedding the wrong field by mistake):

| `source_table` | Text field embedded |
|---|---|
| `regulatory_clauses` | `text` |
| `knowledge_chunks` | `content` |
| `knowledge_documents` | `content` |
| `opportunities` | `title` + `description`, concatenated with a single newline |
| `memory_entries` | `content` |

## 8. Output Contract

```json
{
  "source_table": "regulatory_clauses",
  "processed": 70,
  "skipped_already_embedded": 5,
  "failed": 0,
  "failures": [],
  "total_tokens": 18432,
  "estimated_cost_usd": 0.0004,
  "duration_ms": 3120
}
```

On partial failure (some rows in a batch fail, others succeed), the function must **not** fail the whole batch — successful rows are committed, failed rows are reported individually in `failures` with the row id and error reason, and are retriable in a subsequent call without re-processing what already succeeded.

## 9. Behaviour

1. Resolve `target_ids` (mode `single`/`manual`) or query `source_table` for rows where `embedding IS NULL` (mode `backfill`), respecting `force_reembed`.
2. Read the mapped text field per §7's table. Skip and report as failed any row where the mapped field is null or empty — there is nothing to embed.
3. Batch rows up to `batch_size` per provider API call (the provider supports multi-input embedding requests; do not call the API once per row).
4. On a successful batch response, `UPDATE` each row's `embedding`, `embedding_model`, and `embedded_at` in a single transaction per batch.
5. On a provider rate-limit response (HTTP 429), back off and retry the batch up to 3 times with exponential backoff before marking the batch as failed.
6. Write one `audit_events` row per invocation summarising the batch (counts, cost, duration — not per-row detail).
7. Return the output contract in §8.

## 10. Backfill Plan for Existing Data

The 75 confirmed Regulatory Knowledge Layer clauses (`regulatory_clauses`, all `human_confirmed`) are the first real invocation of this function once built — `mode: "backfill", source_table: "regulatory_clauses"`. This is also the function's first end-to-end test: if it can correctly embed and provenance-tag 75 already-known-good rows, it's ready to be wired into the ongoing ingestion flow for new clauses, `knowledge_chunks`, and `opportunities`.

## 11. Explicitly Out of Scope

- Semantic *search* itself (the query-side: embedding a user's question and running a pgvector similarity search against these columns) — that's a Compliance API / Context Engine concern (`docs/05-`, `docs/04-`), consuming this pipeline's output, not part of this spec.
- Automatic re-embedding triggers on clause edits — deferred per §4 above.
- Multi-provider fallback — single-provider (OpenAI) for v1; the refactor path to the full LLM Gateway is the intended way to add fallback later, not a parallel mechanism built into this function now.

## 12. Implementation Notes (Claude Code, 15–18 Jul 2026)

- Migrations `12_embedding_provenance` (§3 columns) and `13_embedding_pipeline_support` (sentinel "Platform" organisation for `audit_events.organisation_id` attribution on these global, organisation-less tables; `apply_embedding_batch` SECURITY DEFINER RPC for the single-transaction-per-batch write in §9 step 4) applied and validated on staging (`urhocsijfzkepebsmstx`) per ADR-0007.
- `embedding-pipeline-run` deployed to staging with all three shared modules (`supabaseAdmin`, `embeddingSources`, `embeddingClient`) inlined into `index.ts` — the Supabase bundler could not resolve the original relative `../_shared/*` imports at deploy time; this is a packaging fix only, no behavioural change from §5–§11.
- §6's `cost_rollups` write is deferred: v1 returns `total_tokens`/`estimated_cost_usd` in the response and `audit_events.detail` only. The `agent_runs → cost_rollups` aggregator this would feed doesn't exist yet; wiring embedding cost into it is folded into that aggregator's own implementation, not built ad hoc here.
- §10 backfill **complete** (18 Jul 2026, after `OPENAI_API_KEY` billing was resolved): all 75 `regulatory_clauses` rows processed, 0 failures, 7,524 total tokens, $0.00015048 estimated cost, 1925ms duration. Verified independently against the database: 75/75 rows have `embedding` (1536 dims), `embedding_model = 'text-embedding-3-small'`, and `embedded_at` set; matches the `audit_events` row exactly.
- One real bug surfaced only once the OpenAI call finally succeeded and execution reached `apply_embedding_batch` for the first time: the RPC's `search_path = public` couldn't resolve the `vector` type, which lives in `extensions`. Fixed in `14_apply_embedding_batch_search_path_fix.sql` (adds `extensions` to the function's search_path — no signature/behavioural change). Every prior invocation had failed earlier in the pipeline (placeholder key, then billing), so this was never exercised until now.
