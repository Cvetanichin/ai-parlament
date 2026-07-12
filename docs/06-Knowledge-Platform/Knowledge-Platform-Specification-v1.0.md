---
document: Knowledge Platform Specification
version: 1.1
status: APPROVED — approved by Product Owner 12 July 2026; no open items remain (§8)
parent: ../../00-EAS-v1.0.md (EAS §3.3 Layer 3 service catalog, §4 Knowledge Document entity)
related_specs: ../05-Regulatory-Knowledge-Layer/Regulatory-Knowledge-Layer-Specification-v1.0.md, ../04-Platform-Services/Platform-Services-Specification-v1.0.md, ../11-Database-Schema/Database-Schema-Specification-v1.0.md
related_adrs: ../21-ADRs/0006-vector-store-pgvector.md, ../21-ADRs/0007-supabase-as-layer-4-backbone.md
---

# Knowledge Platform — Specification v1.1

## 0. Purpose and Boundary

Institutional document ingestion, embeddings, semantic search, and a light
knowledge graph over **non-regulatory** content: past proposals, lessons
learned, evaluations, SOPs, meeting notes, templates. Two boundaries matter
and are stated once here rather than re-litigated per section:

1. **vs. Regulatory Knowledge Layer (`docs/05-`).** Different provenance
   (donor/legal rules with a citation obligation vs. internal narrative
   content with none), different update cadence (regulatory documents
   change on a donor's schedule; institutional documents change whenever
   staff produce something new), and different consumer contract (a
   Compliance Finding must cite a `RegulatoryClause`; nothing requires a
   drafting suggestion to cite a `KnowledgeDocument`). Kept as separate
   tables and separate ingestion pipelines *of data*, but see §2 — the
   underlying parsing/chunking/embedding mechanics are shared components,
   not reimplemented twice, per EAS principle 1.
2. **vs. Memory Engine (`docs/04-Platform-Services/` §3).** Knowledge
   Platform holds *documents* — long-form, retrieved by semantic search,
   no fixed schema per item. Memory Engine holds *small structured facts*
   — a sentence-length assertion tied to a specific Organisation/Project/
   Proposal/session. A past proposal is a Knowledge Document; "Donor X
   requires budget narratives in French" is a Memory Entry. Context Engine
   (`docs/04-` §1) queries both and merges them.

Also distinct from the real, existing `project_documents` table
(`docs/11-Database-Schema/` §6 note) — project-scoped file metadata for a
specific engagement's evidence/deliverables. §5 below covers when and how
a `project_documents` row becomes a `knowledge_documents` row.

## 1. Source Corpus — Confirmed

EAS §3.3's service catalog table originally stated Knowledge Platform has
"seed content" from the Internal Knowledge Assistant. That was not
accurate: EAS §8's asset integration map assigns the Internal Knowledge
Assistant's actual attached documents (PRAG, Standard Grant Contract
annexes, Guidelines for Applicants) entirely to the **Regulatory**
Knowledge Layer (`docs/05-` §2.1, confirmed against the real files) —
those are rule sources, not institutional knowledge. That correction is
now applied at EAS §3.3 directly.

**A dedicated Google Drive folder has been created as the confirmed v1
seed source**, resolving what was previously this spec's one blocking open
item:

- Parent folder: **"Knowledge Platform Seed Corpus"**
  (`https://drive.google.com/drive/folders/169tE3hKoVIZVZMIvUHaP_xj4OcgCtt3i`)
- Six subfolders, one per `document_type` value (§3), so the ingestion
  connector can tag `document_type` by folder location rather than
  requiring per-file classification at ingest time:

  | Subfolder | `document_type` |
  |---|---|
  | Past Proposals | `past_proposal` |
  | Lessons Learned | `lessons_learned` |
  | Evaluations | `evaluation` |
  | SOPs | `sop` |
  | Meeting Notes | `meeting_notes` |
  | Templates | `template` |

- A README document inside the parent folder explains the mapping and
  what should/shouldn't be added (mirrors this section — kept in sync
  manually; this spec remains the authoritative version if the two ever
  diverge).
- `source_type = 'google_drive'` (§3, §6) with `source_external_id` set to
  the Drive file ID is the concrete mechanism the ingestion pipeline (§2)
  uses to dedup and re-sync from this folder.

The folder currently contains no files — it is infrastructure, not a
populated corpus yet. Populating it (deciding which actual past proposals,
SOPs, and lessons-learned documents to add) is an editorial decision for
whoever owns that content, not an architectural one, and is not tracked as
a spec open item.

Notion and `project_documents` promotion (§5) remain available as
additional source types per §3/§6's schema (`source_type` already
enumerates `notion` and `project_documents`), but neither is connected as
a v1 launch source — only Google Drive, via the folder above, is confirmed.
Adding Notion later requires no schema change, only connecting a source.

## 2. Ingestion Pipeline

```
Document Parser → Chunking → Metadata Extraction → Template Detection
   → Embeddings → Knowledge Graph (entity linking) → Semantic Index
```

**Shared with Regulatory Knowledge Layer, per EAS principle 1 (a capability
needed by more than one service belongs in Layer 3 once, not duplicated):**
Document Parser, Chunking (the generic paragraph/heading-window strategy,
not PRAG's decimal-section-specific variant — see `docs/05-` §4.2), and the
embeddings call itself are implemented as one shared library/function both
services call, each with their own downstream stages after that point. This
is a code-sharing decision, not a schema merge — `regulatory_clauses` and
`knowledge_chunks` (§3) remain separate tables with separate consumer
contracts, per §0.

### 2.1 Document Parser

Source-format-specific (PDF, DOCX, Google Doc export, Notion export,
plain text). No PRAG-style repeating header/footer artifact is assumed by
default — that stripping heuristic is regulatory-corpus-specific
(`docs/05-` §4.1) — but the same generic "detect repeating short lines at
regular intervals" heuristic applies if an ingested source turns out to
have an equivalent artifact.

### 2.2 Chunking

Institutional documents don't share PRAG's decimal section-numbering
convention, so the primary boundary is structural: markdown/DOCX heading
hierarchy where present, falling back to a fixed-size overlapping window
(target ~800 tokens, 15% overlap) for unstructured prose. Each chunk
retains a `section_label` when a heading was available, null otherwise —
weaker citability than the Regulatory Knowledge Layer's clause numbering,
which is acceptable here because nothing downstream requires a
Compliance-Finding-grade citation (§0).

### 2.3 Metadata Extraction

Per document: `document_type` (past_proposal | lessons_learned | evaluation
| sop | meeting_notes | template | other), `tags` (free-form, agent- or
human-assigned), `source_type` (google_drive | notion | project_documents |
manual_upload), `source_external_id` (Drive file ID / Notion page ID, for
re-sync and dedup), author/owner if resolvable, and — where the document
concerns an identifiable Donor/Project/Partner/Proposal — a link row (§6).

### 2.4 Template Detection

An LLM-assisted pass (via the Agent Runtime, never a direct model call,
consistent with `docs/05-` §4.4's pattern) flagging documents that are
**reusable templates** rather than one-off narrative content — a past
logframe structure, a budget template, a standard SOP checklist. Flagged
templates get `document_type = 'template'` and are surfaced distinctly in
retrieval (§4) so, for instance, Logframe Studio (Grant Studio §6) can ask
specifically for "template" results rather than relying on semantic
similarity alone to distinguish a reusable structure from a one-off
narrative that happens to be topically similar.

**Confidence threshold — decided:** reuses the Regulatory Knowledge
Layer's 0.6 default (`docs/05-` §8) rather than introducing a second,
separately-tuned threshold. Below 0.6, a candidate template classification
is not silently trusted — the document keeps its extraction-suggested
`document_type` but is flagged `needs_review` in the same style as a
low-confidence `RegulatoryClause` (`docs/05-` §4.4), for a human to confirm
rather than an agent guess to become the permanent label. Revisit only if
real usage at v1 shows this threshold behaving differently for
institutional content than it does for regulatory text — no evidence of
that yet, so no reason to diverge pre-emptively.

### 2.5 Embeddings + Knowledge Graph

Chunk-level embeddings via the shared embedding call (§2, `docs/06`
co-located with the same pgvector instance as Regulatory Knowledge Layer
and Memory Engine — ADR-0006/ADR-0007). Knowledge Graph here is
deliberately lightweight for v1 — not a graph database, an explicit
`knowledge_document_links` join table (§3) recording which Donor/Project/
Partner/Proposal a document concerns, populated by the same metadata
extraction pass. This mirrors the Event Bus decision (`docs/04-` §4.2) to
use a plain Postgres table rather than introduce new infrastructure before
v1 scale actually needs it.

### 2.6 Semantic Index

Supports keyword and embedding search over `knowledge_chunks`, filterable
by `document_type`, `tags`, and `knowledge_document_links` entity
references — the mechanism §4's retrieval API exposes.

## 3. Data Contracts

Extends the `KnowledgeDocument` entity already named in EAS §4. Splits into
a parent/chunk pair, mirroring the Regulatory Knowledge Layer's
Document/Clause pattern (`docs/05-` §5) for consistency — a single
`content` + single `embedding` per document (the current `knowledge_
documents` shape in `docs/11-Database-Schema/` §6) is too coarse for
documents longer than a page, which past proposals and SOPs routinely are.

```json
// KnowledgeDocument (extends docs/11 §6's knowledge_documents)
{
  "id": "string",
  "organisationId": "string",
  "title": "string",
  "documentType": "past_proposal | lessons_learned | evaluation | sop | meeting_notes | template | other",
  "tags": ["string"],
  "sourceType": "google_drive | notion | project_documents | manual_upload",
  "sourceExternalId": "string, nullable",
  "supersedes": "documentId, nullable",
  "reviewStatus": "auto_confirmed | needs_review | human_confirmed",
  "ingestedAt": "timestamp"
}

// KnowledgeChunk (new)
{
  "id": "string",
  "knowledgeDocumentId": "string",
  "chunkIndex": "integer",
  "sectionLabel": "string, nullable",
  "content": "string",
  "embedding": "vector(1536)"
}

// KnowledgeDocumentLink (new)
{
  "id": "string",
  "knowledgeDocumentId": "string",
  "entityType": "donor | project | partner | proposal",
  "entityId": "string"
}
```

## 4. Retrieval API

`POST /knowledge/documents` (ingest trigger — accepts a source reference,
runs §2's pipeline asynchronously), `GET /knowledge/search?query=&documentType=&tags=&entityType=&entityId=&limit=` (the primary call, and the one **Context Engine** — `docs/04-` §1 — makes as one of its retrieval
sources), `GET /knowledge/documents/{id}` (metadata + chunk list), `POST
/knowledge/documents/{id}/supersede`.

Not a direct caller of ministries — same "services, not applications, call
this" pattern as every other Layer 3 service (EAS principle 2). Grant
Studio's modules and Project Operations both list Knowledge Platform as a
key platform service (EAS §5 applications map) but reach it exclusively
through Context Engine during an Agent invocation, not via ad hoc direct
queries from Layer 1 UI code.

## 5. Reconciliation with `project_documents`

`project_documents` (real, live — file metadata for a specific project's
evidence/deliverables, actual files in the `documents` Storage bucket) is
**not** automatically mirrored into `knowledge_documents`. Most project
documents (signed timesheets, routine correspondence, invoices) have no
institutional-reuse value and would only add retrieval noise. Instead:
**promotion is an explicit, human-triggered action** — a reviewer marks a
specific `project_documents` row (typically a final report, an evaluation,
or a genuinely reusable template) for promotion, which creates a
`knowledge_documents` row with `source_type = 'project_documents'` and
`source_external_id` pointing back to the original row, then runs it
through §2's pipeline. This is consistent with the Memory Engine's
`institutional` tier also being curated rather than automatic
(`docs/04-` §3.1) — the platform's general pattern for anything that
becomes durable, cross-context knowledge is deliberate human promotion, not
silent accumulation.

## 6. Data Model (DDL)

Extends `docs/11-Database-Schema/` §6's existing `knowledge_documents`
table rather than replacing it, and adds two new tables. This should be
appended to `docs/11-Database-Schema/` as a labelled §13 addition (after
§11's Platform Services Domain), keeping that document the single
consolidated schema source per its stated purpose.

```sql
-- extend the existing knowledge_documents table (docs/11 §6)
alter table public.knowledge_documents add column document_type text not null default 'other'
  check (document_type in ('past_proposal','lessons_learned','evaluation','sop','meeting_notes','template','other'));
alter table public.knowledge_documents add column tags text[] not null default '{}';
alter table public.knowledge_documents add column source_type text not null default 'manual_upload'
  check (source_type in ('google_drive','notion','project_documents','manual_upload'));
alter table public.knowledge_documents add column source_external_id text;
alter table public.knowledge_documents add column supersedes uuid references public.knowledge_documents(id);
alter table public.knowledge_documents add column review_status text not null default 'auto_confirmed'
  check (review_status in ('auto_confirmed','needs_review','human_confirmed'));  -- mirrors regulatory_clauses.review_status (docs/05-), set to 'needs_review' when Template Detection (§2.4) confidence is below 0.6
-- the existing single-blob `content` + `embedding` columns (docs/11 §6) are retained for
-- short documents where chunking is unnecessary overhead, but chunk-level retrieval (below)
-- is the primary path for anything longer than roughly one page

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  knowledge_document_id uuid not null references public.knowledge_documents(id),
  chunk_index int not null,
  section_label text,
  content text not null,
  embedding vector(1536)
);
create index on public.knowledge_chunks using hnsw (embedding vector_cosine_ops);

create table public.knowledge_document_links (
  id uuid primary key default gen_random_uuid(),
  knowledge_document_id uuid not null references public.knowledge_documents(id),
  entity_type text not null check (entity_type in ('donor','project','partner','proposal')),
  entity_id uuid not null
);
create index on public.knowledge_document_links (entity_type, entity_id);
```

RLS: inherits `knowledge_documents`' existing `organisation_id` scoping
(`docs/11` §1) — `knowledge_chunks` and `knowledge_document_links` are
scoped indirectly via their parent `knowledge_document_id`'s policy (a
`using (knowledge_document_id in (select id from knowledge_documents))`
join-based policy), not a duplicated `organisation_id` column, since
neither child table has meaning independent of its parent document.

## 7. Non-Functional Requirements

| Concern | Requirement |
|---|---|
| **Corpus quality over corpus size** | No source is auto-ingested wholesale (§1, §5) — every ingestion path is either explicit (a named Drive/Notion folder confirmed by the Product Owner) or human-triggered (a promoted `project_documents` row). |
| **Re-sync and dedup** | `source_external_id` is the dedup key — re-ingesting an already-known Drive file updates its `knowledge_documents`/`knowledge_chunks` rows rather than creating duplicates; a changed source document supersedes (`supersedes` column) rather than silently overwriting, preserving the prior version's chunks for anything that already cited them. |
| **Multi-tenancy** | `organisation_id` + RLS on `knowledge_documents`, inherited by both new child tables (§6). |
| **Shared pipeline consistency** | Any change to the shared Document Parser/Chunking/Embeddings library (§2) is validated against both this service's and the Regulatory Knowledge Layer's test fixtures before deploy — a regression here silently degrades Compliance Finding citation quality too. |

## 8. Resolved Decisions (formerly Open Items)

All three items originally listed here are now resolved, 12 July 2026:

- **Seed corpus** (§1) — decided: a dedicated "Knowledge Platform Seed
  Corpus" Google Drive folder, six subfolders mapping directly to
  `document_type`, `source_type = 'google_drive'` confirmed as the v1
  source. Notion and `project_documents` promotion remain schema-ready but
  not connected at v1.
- **EAS §3.3 correction** — applied. The service catalog table no longer
  claims seed content from the Internal Knowledge Assistant; that asset
  remains fully assigned to the Regulatory Knowledge Layer.
- **Template Detection confidence threshold** (§2.4) — decided: reuses the
  Regulatory Knowledge Layer's 0.6 default, backed by a new `review_status`
  column on `knowledge_documents` (§6) mirroring `regulatory_clauses`'
  pattern rather than silently trusting low-confidence classifications.

No open items remain in this spec. Any future change to these decisions
goes through a new ADR or a documented spec amendment, not a silent edit.
