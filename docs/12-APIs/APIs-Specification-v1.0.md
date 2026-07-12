---
document: APIs Specification — Gateway Contract and Endpoint Catalog
version: 1.0
status: APPROVED — approved by Product Owner 12 July 2026
parent: ../../00-EAS-v1.0.md (EAS §3.4 API Gateway, §6.3 Regulatory APIs)
related_specs: all Layer 2/3 detail specs (catalogued in §6)
---

# APIs — Specification v1.0

## 0. Scope and Boundary

Every spec so far has defined its own endpoints inline (Prompt Registry in
Platform Services §2.3, Regulatory APIs in Regulatory Knowledge Layer §6,
Grant Studio modules' §*.1 sections, House of Parliament §8, and so on).
**This spec does not redefine any of those contracts** — re-deriving them
here would create a second source of truth that drifts from the first. Its
job is narrower and cross-cutting:

1. The API Gateway's shared behaviour — versioning, auth, error shape,
   pagination, rate limiting — that every endpoint inherits regardless of
   which spec owns its business contract.
2. A consolidated catalog (§6) that points to the owning spec for each
   endpoint family, so there is one place to look up "does an endpoint for
   X exist and where is it specified" without grepping ten documents.

## 1. Versioning Strategy

URL-path versioning: `/v1/...`. A breaking change to any endpoint's request
or response shape ships as `/v2/...` alongside the still-serving `/v1/...`,
not an in-place change — consistent with the platform-wide principle of
additive, non-breaking change (Database Schema §0's "ALTER TABLE, never
rename or retype" applied at the API layer). Deprecation: a `/v1/` endpoint
superseded by `/v2/` gets a `Deprecation` response header with a sunset
date; it is not removed until every known caller (Layer 1 applications,
House of Parliament) has migrated, confirmed by a grep of the frontend
codebase, not assumed.

## 2. Authentication and Authorization

Every request carries a Supabase Auth JWT bearer token. The Gateway
resolves two claims relevant to every downstream authorization check
(Security spec §2): the caller's `organisation_members` role(s)
(§2.1 of that spec) and `profiles.is_platform_operator` (House of
Parliament §2). Endpoints that are platform-internal (House of Parliament's
own API surface, §8 of that spec) reject any caller without
`is_platform_operator = true` at the Gateway, before the request reaches
the underlying service — a defense-in-depth layer on top of each service's
own RLS enforcement, not a replacement for it.

## 3. Standard Error Shape

Every non-2xx response returns the same envelope, so Layer 1 applications
handle errors once, not per-endpoint:

```json
{
  "error": {
    "code": "string — machine-readable, e.g. 'gate_precondition_unmet'",
    "message": "string — human-readable",
    "details": "object, optional — endpoint-specific context"
  }
}
```

The `409` gate-precondition pattern already confirmed in the real MVP
(Parliament Core spec §2.4 — e.g. approving Go/No-Go before Research has
run) uses `code: "gate_precondition_unmet"` with `details.missingPrecondition`
naming what's missing — the target contract generalises the real code's
existing `{ error: "..." }` shape into this structured form, not a
behaviour change.

## 4. Pagination and Filtering

List endpoints (`GET /proposals`, `GET /agents/{id}/invocations`, etc.) use
cursor-based pagination: `?cursor=&limit=` (default `limit=50`, max `200`),
response includes `nextCursor: string | null`. Filtering is per-endpoint
query params (already shown in each owning spec, e.g. `GET
/compliance/status?proposalId=`) — this spec does not standardise filter
param names across endpoints, since the filterable fields genuinely differ
per resource.

## 5. Rate Limiting

Per-Organisation, not per-user at v1 (matches the single-Organisation
operating reality, Database Schema §5) — a generous default (e.g. 600
requests/minute/Organisation) high enough not to matter at current scale,
revisited only if actual usage approaches it. House of Parliament's
Playground/Benchmarking traffic (`docs/10-` §9) is tagged separately
(`source = 'house_of_parliament'`) and should not count against an
Organisation's production rate limit, since it is platform-operator testing
traffic, not tenant usage.

## 6. Consolidated Endpoint Catalog

This table is a **routing index, not a contract** — the owning spec's
section is authoritative for request/response shape.

| Endpoint family | Owning spec |
|---|---|
| `/workflows/*` (start instance, status, task complete, gate decide, cancel) | Parliament Core §2.7 |
| `/agents/*` (register, invoke, invocations, deprecate) | Parliament Core §3.7 |
| `/prompts/*` (create, submit-review, approve, rollback, active) | Platform Services §2.3, House of Parliament §4 |
| `/memory/*` (read all tiers; `/memory/institutional` write) | Platform Services §3, House of Parliament §3 |
| `/events/emit` (Event Bus insert) | Platform Services §4.4 |
| `/notifications/*` (channels, rules, log) | Platform Services §5.3 |
| `/compliance/*`, `/eligibility/*`, `/procurement/*`, `/budget/*`, `/reporting/*`, `/visibility/*`, `/contract/*`, `/annex/*` (Regulatory APIs) | Regulatory Knowledge Layer §6 |
| `/eligibility-reports/*` | Grant Studio §3.1 |
| `/proposals/*`, `/proposals/{id}/sections/*` | Grant Studio §5.1 |
| `/logframes/*` | Grant Studio §6.1 |
| `/budgets/*` | Grant Studio §7.1 |
| `/compliance/status`, `/compliance/override` | Grant Studio §8.1 |
| `/reports/*` | Grant Studio §9.1 |
| `/submission-packages/*` | Grant Studio §10.1 |

## 7. Non-Functional Requirements

| Concern | Requirement |
|---|---|
| **Single entry point** | Layer 1 applications call only the API Gateway; no application calls a Layer 3 service's database or Edge Function directly, except where a spec explicitly names a direct Supabase client call as intentional (e.g. Event Bus subscription via Realtime SDK, Platform Services §4.4, which is a subscribe, not a Gateway-mediated call, and is exempted by that spec's own design). |
| **No ministry-to-LLM bypass** | The Gateway does not expose any endpoint that reaches the LLM Gateway directly — every model call routes through Agent Runtime's `/agents/{id}/invoke` (EAS principle 5, restated here as an API-layer enforcement point). |

## 8. Open Items for Product Owner

- Exact rate-limit numbers (§5) are illustrative; real limits should be set
  once actual traffic patterns exist, not guessed now.
- Whether a GraphQL layer is ever warranted alongside REST for the
  Executive Dashboard's cross-application aggregation queries (`docs/13-`)
  is an implementation-time performance question, not decided here.
