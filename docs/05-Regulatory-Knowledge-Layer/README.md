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
