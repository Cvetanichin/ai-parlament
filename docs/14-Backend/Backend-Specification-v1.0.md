---
document: Backend Specification
version: 1.0
status: DRAFT — pending Product Owner approval
parent: ../../00-EAS-v1.0.md (EAS §11 Repository & Documentation Restructuring Plan)
related_specs: ../03-Parliament-Core/Parliament-Core-Specification-v1.0.md, ../15-Infrastructure/README.md, ../19-Deployment/Deployment-Specification-v1.0.md
---

# Backend — Specification v1.0

## 0. Scope and Boundary

Service boundaries, deployment units, and inter-service communication for
Layer 2 and Layer 3 services, once split out of the current monolithic
`backend/` Express app (confirmed real source, Parliament Core spec §0).
Resolves the stub's "confirm or revise" on the historical roadmap's
Node.js + Python split recommendation.

## 1. Language/Runtime Decision — Revises the Historical Roadmap's Assumption

**Node.js remains the primary backend runtime; Python is scoped narrowly,
not adopted as a second general-purpose service tier.** The historical
roadmap assumed Node.js (API gateway + orchestrator) plus Python/FastAPI
microservices for "AI/ML-heavy ministries." Two things learned since then
change this:

- **Most ministries are not ML-heavy — they are LLM-call orchestration.**
  Every ministry built to the Ministry Adapter contract (Parliament Core
  §3.1) does `buildPrompt` → LLM Gateway call → `parseResponse`. This is
  exactly what the real `researchMinistry.js`/`writingMinistry.js` already
  do in Node, and it does not benefit from Python's ML ecosystem — there is
  no local model inference, no numpy/pandas-heavy computation in a
  ministry's own logic.
- **ADR-0007 already established Supabase Edge Functions (Deno/TypeScript)
  as the deployment target for real, live agent logic** (`me-agent`,
  `compliance-agent`, `reporting-agent` — Database Schema §0, Project
  Operations spec §3). A second Python service tier alongside Node/Deno
  would be a third runtime, not a clean two-way split.

**Python is scoped to exactly one place: the document-processing ingestion
pipeline** (Regulatory Knowledge Layer §4, Knowledge Platform's shared
parsing/chunking pipeline) — OCR, PDF parsing, and chunking benefit
genuinely from Python's document-processing ecosystem
(`unstructured`/`pypdf`-class libraries) in a way ministry orchestration
does not. This runs as a separate worker/service, not a general Python
microservice tier — one clearly-scoped exception, not a second stack to
maintain.

## 2. Deployment Units

Per ADR-0007's Supabase-backbone decision, most Layer 2/3 logic deploys as
**Supabase Edge Functions**, not a long-running Node server for every
service:

- **Ministry logic** (Research, Writing, and the seven net-new ministries,
  Parliament Core §0) — one Edge Function per Agent invocation path,
  matching the existing `me-agent`/`compliance-agent`/`reporting-agent`
  pattern already live in production.
- **Prime Minister / Workflow Engine dispatch** — this is the one place a
  long-running process may still be warranted, since Workflow Instance
  state transitions and retry scheduling are not naturally a single
  request/response Edge Function invocation. Whether this is a slim Node
  orchestrator process or Edge-Function-triggered (via `pg_cron`/Realtime
  triggers, per `docs/15-Infrastructure/`'s lean toward Supabase built-in
  primitives) is **not decided here** — deferred to `docs/15-`'s still-open
  Redis/queue question, consistent with how Parliament Core §7 already
  frames it.
- **Document-processing pipeline** (§1) — a separate Python worker,
  triggered by new-document events (Event Bus, Platform Services §4), not
  an Edge Function (Python is not a supported Edge Function runtime on
  Supabase; this is a genuinely separate deployment unit).
- **API Gateway** (`docs/12-APIs/`) — a thin Node/Express (or Fastify) layer
  in front of the Edge Functions and direct Supabase calls, primarily
  handling cross-cutting concerns (auth resolution, rate limiting, the
  standard error envelope) rather than business logic, which stays in the
  Edge Functions themselves.

## 3. Direct Call vs. Event Bus

Restates and confirms Platform Services §4's existing principle, applied
to backend service boundaries specifically:

- **Synchronous, direct call**: Workflow Engine dispatching a Task to Agent
  Runtime; a Human Gate read; any request/response where the caller needs
  the result immediately to proceed.
- **Asynchronous, Event Bus**: notifications, audit/observability fan-out,
  cost aggregation, cross-ministry awareness that isn't blocking (e.g. a
  `compliance_finding.fail` event that the Notification Engine and the
  Observability & Cost Service both care about, independently, without the
  Compliance Engine needing to know either of them exists).

## 4. Inter-Service Authentication

Edge-Function-to-Edge-Function calls use the Supabase service-role key
(server-side only, never exposed to a client); user-facing calls (API
Gateway to Edge Function, or direct client-to-Supabase) use the caller's
own Supabase Auth JWT, RLS-enforced. No service holds a standing
"impersonate any user" credential — service-role access is used for
platform-internal operations (e.g. writing an audit event on behalf of the
system actor), not as a general bypass.

## 5. Migration from the Monolithic `backend/` Express App

Confirmed against real source (Parliament Core spec §0): the current
`backend/server.js` is a single Express app with all routes, all ministry
calls, and all gate logic in one process, backed by `store.js`'s in-memory
Map. The target contract (Parliament Core, this spec) splits this into
Edge Functions plus a slim orchestrator, per §2 above. This is a genuine
architectural change, not a re-platform-in-place — the monolith's routes
(`POST /api/proposals`, `POST /api/proposals/:id/research`, `POST
/api/proposals/:id/run`, gate decisions) map onto the target API Gateway
catalog (`docs/12-APIs/` §6) conceptually, but the underlying process
boundary changes from "one Express app" to "API Gateway + N Edge
Functions." Claude Code should treat this section, not §2.8/§3.8 of
Parliament Core, as the authority on *where code runs*; Parliament Core
remains authoritative on *what the code does*.

## 6. Non-Functional Requirements

| Concern | Requirement |
|---|---|
| **No second general-purpose runtime** | Python is scoped to §1's document pipeline only — a future ministry that "feels like it wants Python" should be re-examined against whether it's actually ML-heavy or just unfamiliar Node patterns, not treated as automatic grounds for a new service in a new language. |
| **Edge Function cold-start awareness** | Workflow Engine dispatch latency budgets (if any are set, `docs/15-`) must account for Edge Function cold starts, not assume always-warm process behaviour a long-running Node server would have had. |

## 7. Open Items for Product Owner

- **Workflow Engine dispatch mechanism** (§2) — Node orchestrator process
  vs. Edge-Function-triggered — genuinely undecided, tracked jointly with
  `docs/15-Infrastructure/`'s Redis/queue question and Parliament Core §7.
- **API Gateway framework choice** (Express vs. Fastify, §2) — an
  implementation detail, not an architectural blocker; either satisfies
  this spec's requirements.
