---
document: Knowledge Hub Specification
version: 1.0
status: APPROVED — approved by Product Owner 12 July 2026; naming collision with docs/08-Project-Operations/ resolved by ADR-0008 (this application renamed "Knowledge Hub", the EAS §3.1/§5 "Intelligence Workspace" name now refers exclusively to the re-platformed existing SaaS product, docs/08-)
parent: ../../00-EAS-v1.0.md (EAS §3.1, §5 Applications Layer)
related_adrs: ../21-ADRs/0008-knowledge-hub-naming.md
related_specs: ../06-Knowledge-Platform/Knowledge-Platform-Specification-v1.0.md, ../04-Platform-Services/Platform-Services-Specification-v1.0.md, ../08-Project-Operations/Project-Operations-Specification-v1.0.md
---

# Knowledge Hub — Specification v1.0

## 0. Scope, and the Naming Collision This Resolves

**Resolved by ADR-0008:** this application is named **Knowledge Hub**, full
stop — not "Intelligence Workspace / Knowledge Hub." The name "Intelligence
Workspace" now refers exclusively to the existing SaaS product
(`cvetanichin.org`) that EAS §8's asset map re-platforms into **Project
Operations** (`docs/08-Project-Operations/`) — the post-award
delivery/monitoring/reporting workspace. Knowledge Hub is a **separate,
new** Layer 1 application: an internal, cross-project research and
institutional-memory surface, unrelated to project delivery. Two different
products no longer share a name; see ADR-0008 for the full decision record,
including the amendment this makes to EAS §3.1 and §5's application table.

**Scope, application/UX layer only** — a consumer of the Knowledge Platform
(`docs/06-`) and Memory Engine (`docs/04-` §3), not a separate knowledge
store:

- Document browser/search over `knowledge_documents` (past proposals, SOPs,
  lessons learned, evaluations).
- Meeting notes capture, feeding the Knowledge Platform's ingestion
  pipeline as a new `knowledge_documents` row (`document_type =
  'meeting_notes'`).
- Institutional-memory viewer — **read-only**, distinct from House of
  Parliament's Memory Explorer (`docs/10-` §1.6), which is the
  curation-authority interface. This application lets any Organisation
  member *read* `organisation`-tier and `institutional`-tier memory
  entries relevant to their work; it grants no write path to
  `institutional` tier (that stays `is_platform_operator`-gated per House
  of Parliament §3).
- Donor/sector intelligence browser — surfaces `donors` and the
  `institutional`-tier memory entries a consultant would want before a
  donor conversation (e.g. "Donor X requires budget narratives in French").

**Explicitly out of scope:** project delivery, monitoring, reporting
(`docs/08-`); document ingestion pipeline mechanics (`docs/06-`, this
application only calls its read/search API); regulatory clause browsing
(that's the Regulatory Knowledge Layer's domain, surfaced to ministries via
API, not a general-staff browsing UI at v1).

## 1. Modules

### 1.1 Document Browser

Search and browse over `knowledge_documents`/`knowledge_chunks` (Knowledge
Platform spec), filtered by `document_type`, `tags`. Calls the Knowledge
Platform's semantic search API — this application holds no embeddings
logic itself.

### 1.2 Meeting Notes Capture

A structured note-taking form that writes a new `knowledge_documents` row
on save (`document_type = 'meeting_notes'`), entering the shared
ingestion/chunking pipeline like any other document — no bespoke storage
path. Optionally links to a `Donor`, `Proposal`, or `Project` record for
context (a `related_entity_type`/`related_entity_id` pair on the
`knowledge_documents` row — confirm this column exists per Knowledge
Platform spec; if not, it is a follow-on to that spec, not invented fresh
here).

### 1.3 Institutional Memory Viewer

Read-only display of `memory_entries` where `tier IN
('institutional','organisation')` and (for `organisation` tier)
`organisation_id` matches the viewer's Organisation. No write action is
exposed anywhere in this module — curation happens exclusively through
House of Parliament (`docs/10-` §3).

### 1.4 Donor & Sector Intelligence Browser

A read view over `donors` joined with relevant `institutional`-tier memory
entries (e.g. donor-specific conventions) and past `proposals`/`reports`
associated with that donor — the "what do we already know about this
donor" surface a consultant checks before Fundraising or Research engages
an Opportunity.

## 2. Data Contract

No new tables. Every module above is a read (and, for §1.2, a single
write) client of `docs/06-Knowledge-Platform/` and `docs/04-Platform-
Services/` §3 (Memory Engine). This application does not introduce a
parallel content store, per its own scope statement.

## 3. API Surface

Reuses, without modification: Knowledge Platform's search/browse API,
Memory Engine's read API (`GET /memory?tier=&scopeId=`, Platform Services
§3). Adds one: `POST /knowledge-documents/meeting-notes` (thin wrapper over
Knowledge Platform's ingestion endpoint, pre-setting `document_type`).

## 4. Non-Functional Requirements

| Concern | Requirement |
|---|---|
| **Read-only memory access** | This application must not expose any write path to `memory_entries` — enforced at the RLS/API layer (same principle as House of Parliament §2's `is_platform_operator` boundary, applied here as a simpler "no write endpoint exists" constraint since no curation authority is needed in this application at all). |
| **PII filter applies** | Meeting notes capture (§1.2) enters the same ingestion pipeline as any Knowledge Platform document, so the pre-prompt PII filter (`docs/16-Security/` §4) applies identically — a meeting note mentioning a beneficiary by name is redacted before embedding, same as any other source document. |

## 5. Open Items for Product Owner

- **`knowledge_documents.related_entity_type`/`related_entity_id`** (§1.2)
  — confirm this column exists in the Knowledge Platform spec's current
  schema, or treat as a follow-on migration if not.
- **Whether the Donor & Sector Intelligence Browser (§1.4) needs write
  access to `donors.comments`/`next_action`** (quick-note-taking during a
  donor call) is a real UX question deferred to `docs/13-Frontend/`
  implementation detail, not an architectural blocker here — if added, it
  is a standard `organisation_members.role`-gated write (Security §2), not
  a new access pattern.
