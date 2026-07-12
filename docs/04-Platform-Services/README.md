---
status: APPROVED — approved by Product Owner 12 July 2026 — see Platform-Services-Specification-v1.0.md
eas_reference: EAS v1.0 §3.3 (Layer 3 service catalog), §13 priority 4
related_adrs: ../21-ADRs/0004-intelligence-workspace-integration-depth.md, ../21-ADRs/0006-vector-store-pgvector.md, ../21-ADRs/0007-supabase-as-layer-4-backbone.md
---
# 04 — Platform Services

Full specification: `Platform-Services-Specification-v1.0.md` — covers the
five Layer 3 services not already specified elsewhere: **Context Engine**
(prompt assembly, stateless orchestration over Memory/Knowledge/Regulatory
retrieval), **Prompt Registry** (a second additive pass over the real,
already-extended `prompt_modules` table — author/approval-state/variables/
test-cases, not a new table), **Memory Engine** (one new table,
`memory_entries`, with a five-tier discriminator — institutional/
organisation/project/proposal/working — rather than five separate tables),
**Event Bus** (a new `platform_events` table + Supabase Realtime, not a
separate queue — consistent with `docs/15-Infrastructure/`'s lean toward
Supabase's built-in primitives), and **Notification Engine** (channels/
rules/log, subscribing to the Event Bus rather than being called directly).

Workflow Engine, Agent Runtime, Regulatory Knowledge Layer, Compliance
Engine, and Knowledge Platform are explicitly out of scope here — see spec
§0 for the full boundary table and, in particular, the Knowledge Platform
vs. Memory Engine distinction (documents vs. small structured facts), which
is the boundary most likely to cause confusion.

All new DDL from this spec has been appended to `docs/11-Database-Schema/`
§11 (v1.2) as the single consolidated schema source — this spec describes
the business contract; that spec is authoritative on table shape.

Three items remain open — spec §8 (institutional memory curation
authority, notification channel secret storage, digest scheduling
mechanism pending `docs/15-`'s still-open Redis/queue question).
