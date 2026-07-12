---
status: APPROVED — approved by Product Owner 12 July 2026 — see Knowledge-Platform-Specification-v1.0.md
eas_reference: EAS v1.0 §3.3 (Knowledge Platform service), §4 (Knowledge Document entity)
related_specs: ../05-Regulatory-Knowledge-Layer/, ../04-Platform-Services/
---
# 06 — Knowledge Platform

Full specification: `Knowledge-Platform-Specification-v1.0.md` — institutional
document ingestion (Drive, Notion, promoted `project_documents`), chunk-level
embeddings, semantic search, and a lightweight knowledge graph (entity-link
table, not a graph database) over non-regulatory content: past proposals,
lessons learned, evaluations, SOPs, meeting notes, templates.

Shares its Document Parser/Chunking/Embeddings pipeline as a common library
with `docs/05-Regulatory-Knowledge-Layer/` (EAS principle 1 — a capability
needed by more than one service isn't duplicated), but keeps separate tables
and separate downstream stages — regulatory rule extraction has no
institutional-content equivalent, and institutional promotion has no
regulatory equivalent. Extends the existing `knowledge_documents` table
(`docs/11-Database-Schema/` §6) to a parent/chunk model rather than the
original single-blob-per-document shape, and adds `knowledge_chunks` +
`knowledge_document_links`.

**Correction to EAS §3.3, applied:** that table's claim of existing "seed
content" from the Internal Knowledge Assistant did not hold up — those
documents (PRAG, Standard Grant Contract annexes, Guidelines for
Applicants) are entirely regulatory and were already assigned to `docs/05-`
in EAS §8.

**Seed corpus confirmed:** a dedicated "Knowledge Platform Seed Corpus"
Google Drive folder has been created, with six subfolders mapping directly
to the `document_type` taxonomy (Past Proposals, Lessons Learned,
Evaluations, SOPs, Meeting Notes, Templates) — populating it with actual
content is an editorial decision, not an architectural one. Template
Detection's confidence threshold is also decided (reuses the Regulatory
Knowledge Layer's 0.6 default). No open items remain in this spec (v1.1).
