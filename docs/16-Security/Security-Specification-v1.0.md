---
document: Security Specification — AuthN/AuthZ, PII, Encryption, GDPR
version: 1.0
status: APPROVED — approved by Product Owner 12 July 2026; follow-on migrations (§5, §7) to be appended to docs/11-Database-Schema/ before implementation begins
parent: ../../00-EAS-v1.0.md (EAS §7.3 Data protection, §9 Non-Functional Requirements)
related_adrs: ../21-ADRs/0005-multi-tenancy-built-in-day-one.md, ../21-ADRs/0007-supabase-as-layer-4-backbone.md
related_specs: ../11-Database-Schema/Database-Schema-Specification-v1.0.md, ../04-Platform-Services/Platform-Services-Specification-v1.0.md, ../10-House-of-Parliament/House-of-Parliament-Specification-v1.0.md, ../19-Deployment/Deployment-Specification-v1.0.md
---

# Security — Specification v1.0

## 0. Scope and Boundary

This spec covers the security concerns EAS §7.3 and §9 named but did not
detail: authentication, the role-based access control (RBAC) permission
matrix, the policy layer on top of multi-tenant data isolation, PII filter
design, encryption at rest/in transit, secrets vault mechanism, and GDPR
right-to-erasure implementation.

**Explicitly out of scope, lives elsewhere:**

| Concern | Lives in |
|---|---|
| Multi-tenant isolation *mechanism* (RLS, `organisation_id` columns) | `docs/11-Database-Schema/` (ADR-0005) — this spec defines the *policy* those RLS rules encode, not the DDL pattern itself |
| Staging-validation discipline, environment hardening runbook | `docs/19-Deployment/` (Approved) — this spec does not re-specify what's already decided there |
| AI App Register, EU AI Act deployer-obligation tracking | `docs/17-AI-Governance/` (not yet specified) |
| Identity provider choice | Already decided — Supabase Auth (`auth.users`), Database Schema §2. Not re-opened here. |

This spec resolves two items previously left open against it by name:
notification channel secret storage (Platform Services §8, Database Schema
§14) and the fine-grained RBAC permission matrix (Database Schema §2, House
of Parliament §2/§11).

## 1. Authentication

Identity substrate is unchanged: Supabase-managed `auth.users` plus
`public.profiles` (Database Schema §2). This spec adds one requirement not
previously stated:

**MFA (TOTP) is required for any account with `profiles.is_platform_operator
= true`** (House of Parliament §2). Standard Organisation-scoped users are
not required to use MFA at v1 — recommended but not enforced, consistent
with not over-engineering a single-consultancy deployment ahead of need.
Rationale: `is_platform_operator` is a cross-tenant, platform-internal
capability (institutional memory curation, prompt promotion — House of
Parliament §3, §4); its blast radius if compromised is materially larger
than a single Organisation member's account, so it gets a materially
stronger authentication bar.

## 2. RBAC Permission Matrix

Two independent axes exist and must not be conflated:

- **Organisation-scoped role** (`organisation_members.role`) — governs what
  a user can do *within the Organisations they belong to*.
- **Platform-level operator flag** (`profiles.is_platform_operator`) —
  governs access to House of Parliament and platform-internal tables (Prompt
  Registry, institutional memory), which are platform-global, not
  Organisation-scoped, by design (Parliament Core §3.6, House of Parliament
  §2).

### 2.1 Organisation-scoped roles (v1)

`organisation_members.role` (Database Schema §1) is extended from a bare
`text` default `'member'` to a constrained enum:

```sql
alter table public.organisation_members
  add constraint organisation_members_role_check
  check (role in ('owner', 'admin', 'member', 'viewer'));
```

| Role | Can do | Cannot do |
|---|---|---|
| `owner` | Everything `admin` can, plus: manage billing, add/remove `admin` and `owner` members, delete the Organisation | — |
| `admin` | Approve Human Gates (§2.2), invoke the Compliance Override control (EAS §3.1), manage organisation content, add/remove `member`/`viewer` | Billing, ownership transfer |
| `member` | Standard operation: draft proposals, run ministries, view organisation content | Approve Human Gates, Compliance Override, member management |
| `viewer` | Read-only access to organisation content | Any write action |

This is a v1-deliberately-simple matrix — one role field, four values, no
per-module permission overrides. Database Schema §2 flagged that "full
permission-matrix detail remains `docs/16-Security/`'s job"; this table is
that detail. A finer per-capability grant system (e.g. "can approve gates
but not invoke Compliance Override") is not built at v1 — see §9.

### 2.2 Human Gate approval authority

EAS §7.2 requires a **named human approver** logged against every gated
artefact. This spec resolves *which* role qualifies: `owner` or `admin`
only, for all four Human Gates (Strategic, Go/No-Go, Polish, Submission,
EAS §3.1) and the Compliance Override control. `member` and `viewer` cannot
satisfy a gate, even if they are the only person available — this is a
deliberate constraint, not an oversight; a small consultancy with only
`member`-role staff on a given engagement must escalate to an `owner`/
`admin`, which is the intended friction (EAS principle 4: human-in-the-loop
is structural).

### 2.3 Platform-operator boundary — what `is_platform_operator` does NOT grant

`is_platform_operator` (House of Parliament §2) is powerful for
platform-internal tables (Prompt Registry, institutional-tier memory,
Workflow Definitions) but is **not** a backdoor into any Organisation's
tenant-scoped business data (proposals, projects, donor records, budgets).
RLS policies on tenant-scoped tables continue to check
`organisation_members` membership only; `is_platform_operator` grants no
implicit `select`/`insert`/`update` on any table carrying `organisation_id`.
This boundary must be enforced at the RLS policy level, not by UI
convention — a platform operator debugging a specific Organisation's issue
via House of Parliament's read modules (Context Viewer, Live Logs) sees
platform-internal metadata about the invocation (which Agent, which Prompt
Version, token cost, confidence) but not the underlying proposal content
unless separately granted Organisation membership.

## 3. Multi-Tenant Isolation — Policy Layer

ADR-0005 and Database Schema establish the *mechanism* (RLS,
`organisation_id`). This section states the *policy* it encodes: no user,
regardless of role, sees another Organisation's tenant-scoped data, with
exactly one exception carried over from existing platform decisions —
`memory_entries` tier `institutional` (Platform Services §3.1), which is
cross-tenant *by design* (curated donor/sector knowledge, not
Organisation-specific), and is governed by `is_platform_operator` write
authority (House of Parliament §3), not `organisation_members` membership.
No other cross-tenant read or write path exists in v1.

## 4. PII Filter (Pre-Prompt Redaction)

Operationalises EAS §7.3: "Beneficiary PII... excluded from the Knowledge
Platform's RAG index and from any prompt sent through the LLM Gateway,
enforced by a pre-prompt PII filter at Layer 4."

### 4.1 Scope of "PII" for this filter

Beneficiary PII only — names, vulnerability status, GPS/location data (EAS
§7.3's explicit list), plus national ID numbers and beneficiary contact
details (phone/email) where present in source documents. **Donor, partner,
and staff contact information is explicitly out of scope for this filter**
— that data is operationally necessary (a Donor's programme officer email,
a Partner's legal signatory) and is not what EAS §7.3 is protecting against;
filtering it would break the platform's actual function. This distinction
must be encoded in the filter's configuration, not left to a blanket PII
regex.

### 4.2 Two enforcement points

1. **Knowledge Platform ingestion** — a redaction stage inserted into the
   shared parsing/chunking pipeline (Knowledge Platform §-, Regulatory
   Knowledge Layer §4) before the embedding step, so beneficiary PII never
   enters the vector index in the first place. Detected spans are replaced
   with a typed placeholder token (e.g. `[BENEFICIARY_NAME_REDACTED]`,
   `[GPS_REDACTED]`), not deleted silently — placeholders preserve document
   structure for downstream retrieval.
2. **LLM Gateway pre-prompt filter** — a second, independent scan of the
   fully assembled Context Engine payload (Platform Services §1)
   immediately before it is sent to any provider. This is a deliberate
   defense-in-depth duplication of (1): it catches PII that entered the
   platform through a path other than Knowledge Platform ingestion (e.g.
   pasted directly into a drafting session) or that (1) missed.

### 4.3 Detection approach (v1)

Pattern-based (regex + keyword list) for GPS coordinates, national ID
formats, and phone/email patterns; name detection is the weakest link at
v1 — cross-referenced against a beneficiary name list where the ministry
has one (e.g. an M&E indicator dataset), falling back to no name-specific
filtering when no such list exists. **This is a known v1 limitation, not a
silent gap** — logged explicitly in §9. A proper NER-model-based approach is
deferred pending a cost/accuracy evaluation (§9).

### 4.4 Auditability

Every redaction (both enforcement points) writes an Audit Event: which
filter stage, which placeholder type, the source document/session — never
the redacted content itself, per EAS §9's PII-excluded-from-audit-log
requirement (EAS §7.3).

## 5. Encryption

**In transit:** TLS enforced end-to-end — API Gateway rejects non-HTTPS,
Supabase connections use `sslmode=require` (already the platform default,
confirmed here as a requirement, not a new decision).

**At rest:** Supabase-managed encryption at rest covers the primary
PostgreSQL instance and Object Storage by default (confirmed, no new
architecture). For **application-level secrets that must not be readable
even via normal database access** — third-party webhook URLs, API tokens,
SMTP credentials — this spec adds Supabase Vault (`pgsodium`-backed,
already available in the platform's Supabase project per ADR-0007) as the
storage mechanism, resolving the open item both Platform Services §8 and
Database Schema §14 left against `notification_channels.config`:

```sql
-- Follow-on to docs/11-Database-Schema/ §11d
alter table public.notification_channels add column config_secret_id uuid;
-- config_secret_id references a Supabase Vault secret (vault.secrets)
-- holding the sensitive portion of config (webhook URL, SMTP password).
-- notification_channels.config (existing jsonb column) is retained for
-- non-sensitive metadata (channel_type-specific display fields) only.
```

The read API (`GET /notifications/channels`, Platform Services §5.3) must
never return the Vault-stored plaintext — it returns existence/last-4-style
metadata only, matching standard secret-display conventions.

## 6. Secrets Vault (Platform-Wide)

Supabase Vault is the confirmed mechanism for **tenant- or channel-specific**
secrets (notification webhooks, per-Organisation integration tokens, should
any be added later). **Platform-wide secrets** that are not tenant data —
the LLM Gateway's provider API keys, the Supabase service-role key itself —
remain environment variables in the deployment environment (`docs/19-
Deployment/`'s existing mechanism), never committed to the repository, never
stored in a database table. This is a deliberate two-tier split: Vault for
anything that varies per Organisation or per channel (because it's data the
platform holds on behalf of a tenant), environment variables for anything
that is infrastructure configuration (because it isn't tenant data at all
and belongs to the deployment, not the database).

## 7. GDPR Right-to-Erasure

EAS §9 already commits to "deletable, not soft-deleted" records. This
section states the concrete rule an erasure request follows, since "delete
everything" and "the audit trail must never be altered post-write" (EAS §9
auditability) are in tension and need a resolution:

| Data category | Erasure action |
|---|---|
| A departing user's own account/profile (`auth.users`, `public.profiles`, `organisation_members` row) | Hard delete. |
| Content the user authored on behalf of an Organisation and that the Organisation continues to own (proposals, prompt versions, workflow definitions) | **Anonymize, do not delete** — the content is Organisation work product, not the user's personal data; `author_id`/`created_by`-style references are nulled, the content itself is retained. |
| Audit Events referencing the user as actor | **Anonymize the actor reference, never delete the event row** — consistent with the append-only pattern already used for `notification_log` (`revoke update, delete from authenticated`, Platform Services §5.2) and required by EAS §9's auditability NFR, which does not carve out an exception for erasure requests. |
| Beneficiary PII specifically | Because §4's filter already prevents beneficiary PII from entering the RAG index or any LLM prompt, an erasure request concerning a beneficiary is scoped to **source documents** (Object Storage originals, any un-embedded staging copy in the Knowledge Platform ingestion queue) — hard-deleted. Already-generated downstream artefacts (Compliance Findings, drafted narratives) reference the beneficiary only via redacted placeholder tokens and require no further action, since no raw PII persisted past the filter. |

This table is the authoritative erasure rule for every future spec touching
personal data — a new table introduced elsewhere should classify itself
against one of these four rows rather than inventing a new erasure
behaviour.

## 8. Non-Functional Requirements

| Concern | Requirement |
|---|---|
| **Auditability precedence** | Where GDPR erasure and audit-log immutability conflict (§7), audit-log immutability wins via anonymization, never deletion of the event row — this is a platform-wide precedent, not a per-table judgment call. |
| **Least privilege** | `is_platform_operator` (§2.3) grants platform-internal access only; it is never used as a general Organisation-data override, enforced at the RLS layer. |
| **Secret handling** | No secret (API key, webhook URL, credential) is ever returned in plaintext by a read API once stored via Vault (§5, §6) — display-only metadata (last-4, existence) only. |
| **PII filter fail-safe** | If the PII filter (§4) cannot classify a span with confidence, the platform-wide default (0.6, matching the Regulatory Knowledge Layer / Platform Services convention) applies: redact rather than pass through — false positives (over-redaction) are the acceptable failure mode, not false negatives. |

## 9. Non-Goals

- Does not re-decide the identity provider (Supabase Auth, already settled).
- Does not build the AI App Register or EU AI Act deployer-obligation
  tracking — `docs/17-AI-Governance/`.
- Does not introduce a per-capability permission-override system beyond the
  four-role matrix in §2.1 — that is a v2 concern, revisited once a real
  second Organisation or a larger single-Organisation team makes the
  four-role granularity insufficient in practice, not speculatively now.

## 10. Open Items for Product Owner

- **PII detection model** (§4.3) — pattern-based v1 vs. a proper NER model
  is a cost/accuracy tradeoff not resolved here; v1 ships with the weaker,
  cheaper approach and this is a known, logged limitation, not silently
  accepted as "done."
- **MFA enforcement scope** (§1) — currently limited to
  `is_platform_operator` accounts; whether to extend to `owner`/`admin`
  Organisation roles too is a friction/security tradeoff for the Product
  Owner, not decided here.
- **Four-role granularity** (§2.1) — revisit once team size or a second
  Organisation makes finer-grained permissions actually necessary; not a
  v1 blocker.

## 11. Resolved Decisions

- **Notification channel secret storage** (previously open, Platform
  Services §8 / Database Schema §14): Supabase Vault via
  `notification_channels.config_secret_id`, §5.
- **RBAC permission matrix** (previously open, Database Schema §2 / House
  of Parliament §2, §11): four-role Organisation-scoped enum plus the
  platform-operator boundary rule, §2.
