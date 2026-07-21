---
status: APPROVED — approved by Product Owner 12 July 2026 — see Regulatory-Knowledge-Layer-Specification-v1.0.md (v1.1)
eas_reference: EAS v1.0 §6 (Regulatory Knowledge Layer, first-class service), §13 priority 2
---
# 05 — Regulatory Knowledge Layer

Full specification: `Regulatory-Knowledge-Layer-Specification-v1.0.md`
(v1.1) — source corpus (grounded in the actual PRAG 2025 / Standard Grant
Contract / Annex documents already in the project), the normative
hierarchy ported from the Internal Knowledge Assistant, the full ingestion
pipeline (Document Parser through Compliance API), data contracts, the
eight Regulatory API endpoints, versioning/change management, and the
Internal Knowledge Assistant migration plan.

All four originally open items are resolved (§12): the extraction
confidence threshold is decided (0.6, now the platform-wide reference
default reused by `docs/06-Knowledge-Platform/`); national law is
confirmed out of scope for Wave 1 by default, revisited only if a specific
country need arises; the organisational policy corpus has a confirmed
ingestion target (a dedicated "Organisational Policy Corpus" Google Drive
folder, six subfolders by category), empty but no longer undefined; and
legacy PRAG versions are handled by a new `projects.prag_version` column
(`docs/11-Database-Schema/`) plus a `legacy_prag_pending` finding status —
a fallback mechanism that closes the question architecturally without
requiring an answer about the organisation's actual grant portfolio.

## Implementation status (20 Jul 2026)

The ingestion pipeline (§4: parser, chunker, deterministic rule-obligation
classifier) is built — `supabase/functions/_shared/regulatoryIngestion.ts`,
invoked via `regulatory-document-ingest-run`. **`regulatory_clauses` and
`compliance_findings` remain empty on purpose.** The real source text this
spec is grounded in (`PRAG_2025_full_version_en.md`, the Standard Grant
Contract annexes, `Internal Knowledge Assistant.md`) was read in a separate
authoring session and was never committed to this repository — searched
for and confirmed absent. Populating these tables means calling
`regulatory-document-ingest-run` with that real text once it's available
in this repo or supplied directly; nothing in this codebase fabricates
clause text to fill the gap. Until then, `eligibilityEngine.ts`,
`budgetEngine.ts`, and every other Compliance Studio validator correctly
keep returning `context_dependent`/`pass with a caveat` rather than a
false positive.
