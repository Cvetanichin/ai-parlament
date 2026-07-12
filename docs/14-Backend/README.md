---
status: not yet specified
eas_reference: EAS v1.0 §11 (Repository & Documentation Restructuring Plan)
---
# 14 — Backend

Scope: service boundaries, deployment units, and inter-service communication
(direct call vs. Event Bus) for Layer 2 and Layer 3 services once split out of
the current monolithic `backend/` Express app. Node.js (Express/Fastify) as API
gateway + PM orchestrator; Python (FastAPI) microservices for AI/ML-heavy
ministries (scraping, document parsing, RAG) per the historical roadmap's stack
recommendation — confirm or revise here.
