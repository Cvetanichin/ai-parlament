---
status: APPROVED — approved by Product Owner 12 July 2026 — see Backend-Specification-v1.0.md
eas_reference: EAS v1.0 §11 (Repository & Documentation Restructuring Plan)
---
# 14 — Backend

Full specification: `Backend-Specification-v1.0.md` — **revises** the
historical roadmap's Node+Python split: Node/Deno (Supabase Edge Functions,
matching the real, live `me-agent`/`compliance-agent`/`reporting-agent`
pattern) is the primary runtime for all ministry logic; Python is scoped
narrowly to the document-processing ingestion pipeline only, not adopted as
a general second service tier. Confirmed against the real MVP source
(Parliament Core spec §0).
