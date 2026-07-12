---
document: House of Parliament Specification — Developer/Integration Workspace
version: 1.0
status: APPROVED — approved by Product Owner 12 July 2026; two follow-on migrations (§7) to be appended to docs/11-Database-Schema/ before implementation begins
parent: ../../00-EAS-v1.0.md (EAS §3.1 Layer 1 applications, §11 repo restructuring, §13 "Next step")
existing_assets: frontend/index.html (parliamentary-ai-gov repo) — retained as the literal seed of the Playground module, not the whole application
related_specs: ../03-Parliament-Core/Parliament-Core-Specification-v1.0.md, ../04-Platform-Services/Platform-Services-Specification-v1.0.md, ../11-Database-Schema/Database-Schema-Specification-v1.0.md, ../05-Regulatory-Knowledge-Layer/Regulatory-Knowledge-Layer-Specification-v1.0.md
related_adrs: ../21-ADRs/0003-vote-of-no-confidence-threshold.md
---

# House of Parliament — Developer/Integration Workspace — Specification v1.0

## 0. Scope and Boundary

House of Parliament is the **internal, non-customer-facing** workspace where
new agents, prompts, workflows, and compliance rules are authored and tested
before promotion to the production platform (EAS §3.1, §12). It is a Layer 1
application like Grant Studio or Project Operations, but its users are the
platform's own operators (Product Owner, and eventually delegated technical
staff), not CSO end users.

**Explicitly not in scope for this spec:**

- The production Ministries Dashboard and per-application UI (Grant Studio,
  Project Operations, Intelligence Workspace, Executive Dashboard) —
  `docs/13-Frontend/`.
- New business-domain data. House of Parliament reads and writes tables
  already specified elsewhere (`prompt_modules`, `memory_entries`,
  `agent_runs`, `workflow_definitions`/`workflow_instances`,
  `platform_events`); it does not introduce a parallel data model.
- Full RBAC / permission-matrix design. This spec defines the one coarse
  access flag House of Parliament needs to function (§2); the general
  permission-matrix framework is `docs/16-Security/`'s job.

**Existing asset:** `frontend/index.html` (the current MVP's static
playground) is retained as the literal seed of the **Playground** module
(§1.14) — not rewritten, not treated as the production dashboard (EAS §11).
Every other module in this spec is net-new UI built against the API surface
already defined by Parliament Core and Platform Services, not an extension of
the static HTML.

## 1. Modules

Each module is a thin client over an already-specified Layer 3 API. This spec
does not repeat those APIs' contracts — it maps each module to what it calls
and states any House-of-Parliament-specific behaviour.

### 1.1 Prompt IDE

Authors `prompt_modules` draft versions: content, `variables`, `test_cases`.
Calls Prompt Registry's `POST /prompts` and `POST /prompts/{id}/submit-review`
(Platform Services §2.3). Enforces the versioning model of Platform Services
§2.2: a save is always a new row/version, never a mutation of an existing
`content`.

### 1.2 Prompt Diff & Version History

Renders the version history for an Agent (`GET /prompts?agentId=`) and a
side-by-side diff between any two versions — most commonly the draft under
review and the currently `active` version. This diff view is a mandatory step
before **Promotion** (§4).

### 1.3 Agent Registry

Lists and registers Agents (Parliament Core §3.1, §3.7: `POST
/agents/register`, `GET /agents/{id}/invocations`). Shows each Agent's
currently active Prompt Version and provider binding (mock or real, via the
LLM Gateway).

### 1.4 Workflow Builder

Authors and edits Workflow Definitions (Parliament Core §2.1): states,
transitions, retry policies, gates, and the per-Workflow-Definition
`voteOfNoConfidenceThreshold` field (ADR-0003, default `2`) — the first
concrete interface for the "knob" that ADR-0003 introduced but left
unimplemented. Changing a threshold on a Workflow Definition already in use
by running Workflow Instances only affects instances created after the
change; in-flight instances keep the threshold they started with.

### 1.5 Context Viewer

Read-only inspection of a specific Agent invocation's assembled Context
Engine request/response (Platform Services §1): what was retrieved, what was
truncated, and why (`truncated: true` per Platform Services §7 token-budget
discipline). Primary debugging tool for "why did the model produce this" —
distinct from Live Logs (§1.8), which is the event stream, not the assembled
prompt itself.

### 1.6 Memory Explorer

Browses `memory_entries` across all five tiers (Platform Services §3.1) for a
given scope. This module is also the **confirmed interface for institutional
memory curation** — see §3 below, which resolves the open item both Platform
Services §8 and Database Schema §14 left pending against this spec.

### 1.7 Vector Search Console

Ad hoc semantic-search query interface against the pgvector indexes backing
the Knowledge Platform, the Regulatory Knowledge Layer's clause index, and
Opportunity embeddings (EAS §3.4). Used to tune retrieval (chunk size,
similarity threshold) rather than as an end-user search tool — its output
feeds Prompt IDE / Context Viewer debugging, not a ministry's runtime path.

### 1.8 Live Logs

Tails `platform_events` (Platform Services §4) and Audit Events (EAS §3.2,
§9) in near-real-time via Supabase Realtime, the same delivery mechanism the
Notification Engine subscribes to.

### 1.9 Confidence Scores

Surfaces the `confidence` field wherever it already exists in the data model
— Compliance Findings (Regulatory Knowledge Layer §5, §8), `memory_entries`
writes (Platform Services §7), Knowledge Platform extraction — as a single
cross-service view, so a below-threshold (< 0.6, the platform-wide default)
item is visible without querying each service separately.

### 1.10 Token Usage / Cost

Per-invocation and per-Agent token/cost display, sourced from whatever the
Observability & Cost Service (`docs/17-AI-Governance/`, not yet specified)
persists. This module is a consumer of that service's data, not a
replacement for it — if `docs/17-` is not yet built, this module has no data
source and ships as a stub. See §9 on cost attribution for House of
Parliament's own usage.

### 1.11 Replay Sessions

Re-runs a past Workflow Instance or Agent invocation with its original
recorded inputs, optionally against a different Prompt Version, for
regression testing before promoting a change. Reuses Agent Runtime's normal
invocation path (§1.14) with recorded rather than live inputs; does not
write back to the original Workflow Instance's history.

### 1.12 Benchmarking

Batch-runs an Agent Version's `test_cases` (the `{input, expectedCriteria}`
pairs Platform Services §2.1 reserved `prompt_modules.test_cases` for) and
reports pass rate, cost, and latency per case. Intended as a gating check
before Promotion (§4), not a hard platform-enforced gate at v1 — Promotion
still requires the human action described in §4 regardless of benchmark
results; a failing benchmark does not block promotion mechanically, it
informs the human's decision.

### 1.13 Veto Debugger

Steps through the Tripartite Veto Engine's three tiers (deterministic,
lexical, semantic — EAS §3.2) for a specific artefact and invocation, showing
which tier fired, what rule or rubric it checked against (with the
Regulatory Knowledge Layer citation, per Regulatory Knowledge Layer §6), and
the resulting verdict. This is the primary tool for diagnosing a Vote of No
Confidence escalation (Parliament Core, ADR-0003).

### 1.14 Playground

Ad hoc single-invocation testing — the literal continuation of the current
MVP's `frontend/index.html`. Invokes Agent Runtime's `POST
/agents/{id}/invoke` against either a mock or a real provider binding through
the same code path (Parliament Core §3.8, point 1: the mock fallback is a
first-class `AgentVersion`, not a special-cased branch), which is what makes
Playground testing meaningful as a rehearsal for production behaviour rather
than a separate simulated path.

## 2. Access Control

House of Parliament is not Organisation-scoped — its users are platform
operators, not members of any single tenant Organisation, so the existing
`organisation_members.role` field (Database Schema §2) is the wrong
mechanism to gate it: that field's semantics are inherently per-Organisation,
and House of Parliament's operators may not belong to any CSO Organisation at
all.

**v1 mechanism:** a new platform-level flag, not an Organisation-scoped role:

```sql
alter table public.profiles add column is_platform_operator boolean not null default false;
```

Every House-of-Parliament-gated action in this spec (Promotion, institutional
memory curation, threshold changes) requires `profiles.is_platform_operator =
true` for the acting user, checked at the RLS/API layer, not by client-side
discretion — the same "structural, not optional" principle EAS §7.2 applies
to Human Gates applies here to platform-operator actions.

This is deliberately coarse: it does not distinguish "can view logs" from
"can promote a prompt" from "can curate institutional memory." A finer
permission matrix (read-only operator vs. full operator, for example) is
explicitly deferred to `docs/16-Security/` — this flag is what unblocks the
two open items below without waiting for that broader design.

This migration should be appended to `docs/11-Database-Schema/` §2 as a
labelled follow-on (same pattern Platform Services §2.1 used for
`prompt_modules`), not duplicated there.

## 3. Institutional Memory Curation Workflow (resolves Platform Services §8 / Database Schema §14)

**Both specs left this open:** "who has authority to write to the
`institutional` tier, and through what interface." This spec confirms both:

- **Interface:** the Memory Explorer module (§1.6), specifically its
  institutional-tier view.
- **Authority:** any user with `profiles.is_platform_operator = true` (§2).
  No other role, and no agent or workflow, may write an `institutional`-tier
  `memory_entries` row — this was already stated as a rule in Platform
  Services §3.1 ("no automatic write path in v1"); this section is what
  operationalises it as an actual enforced interface rather than an
  unimplemented constraint.

**New API surface** (extends, does not replace, Memory Engine's existing
data contract):

`POST /memory/institutional` (tier fixed to `institutional`,
`organisation_id` fixed to `null`), `PATCH /memory/institutional/{id}`
(amend an existing entry — institutional memory is corrected, not
versioned, since it is not agent-authored). Both require
`is_platform_operator`; both require a free-text `justification` field
(new, `memory_entries`-scoped) distinct from the entry content itself, so
the audit trail captures *why* a cross-tenant assertion was accepted, not
only what it says.

**Confidence:** human-curated institutional entries default `confidence =
1.0`, bypassing the < 0.6 auto-flagging behaviour Platform Services §7
defined for agent-written entries — that threshold exists to catch
low-confidence *agent* guesses; a platform operator's deliberate curation
is not the failure mode it guards against.

```sql
alter table public.memory_entries add column justification text;
```

This migration, like §2's, is a labelled follow-on to
`docs/11-Database-Schema/` §11b (Memory Engine), not a duplicate definition.

## 4. Prompt Promotion Workflow

Operationalises Platform Services §2.2/§2.3's "requires a human action
(House of Parliament UI)" and "human-gated, House of Parliament" language,
which described the *rule* without an interface to point to.

Flow: Prompt IDE (§1.1) creates a draft → `submit-review` moves it to
`pending_review` → Prompt Diff (§1.2) renders the draft against the
currently `active` version → a `is_platform_operator` user calls `POST
/prompts/{id}/approve`, which is what actually flips `approval_state` to
`approved` and `status` to `active`, deprecating the previous active
version (Platform Services §2.2's partial-unique-index invariant). No agent,
workflow, or non-operator user can reach `approve` — this is the same
principle as §3's institutional-memory gate, applied to prompts instead of
memory.

Every approval and rollback (Platform Services §2.2's rollback mechanism) is
written to the Audit Event trail with the acting operator's identity, per
EAS §9 auditability.

## 5. Vote of No Confidence Threshold Authoring

Workflow Builder (§1.4) is the confirmed interface ADR-0003 anticipated but
did not specify. Editing `workflow_definitions.voteOfNoConfidenceThreshold`
requires `is_platform_operator`; the change is logged as an Audit Event
(who, old value, new value, which Workflow Definition) — the same rationale
ADR-0003 gave for treating this as a deliberate per-Workflow-Definition
decision, not a casual platform default, now has an enforcement mechanism
behind it.

## 6. Mock Agent Testing

Playground (§1.14) and Replay Sessions (§1.11) both invoke Agent Runtime's
standard `POST /agents/{id}/invoke` path against mock `AgentVersion`
provider bindings, per Parliament Core §3.8 point 1. No House-of-Parliament-
specific mock infrastructure is introduced; the value of this module is
precisely that it uses the *same* invocation path production traffic uses,
so a Playground/Replay result is a valid rehearsal of production behaviour.

## 7. Data Contracts Summary

No new business-domain tables. Two labelled follow-on migrations, both
appended to `docs/11-Database-Schema/` (not duplicated there — this spec
states the business contract, `docs/11-` remains DDL source of truth):

```sql
-- Follow-on to §2 (Identity)
alter table public.profiles add column is_platform_operator boolean not null default false;

-- Follow-on to §11b (Memory Engine)
alter table public.memory_entries add column justification text;
```

Every other module (§1.1–§1.5, §1.7–§1.10, §1.12–§1.14) is read/write access
to tables and APIs already fully specified in Parliament Core, Platform
Services, the Regulatory Knowledge Layer, and Database Schema — House of
Parliament introduces no parallel schema for logs, invocations, or events.

## 8. API Surface Summary

Reuses, without modification: Prompt Registry's full API (Platform Services
§2.3), Agent Runtime's full API (Parliament Core §3.7), Workflow Engine's
Workflow Definition CRUD (Parliament Core §2), Memory Engine's read API
(Platform Services §3). Adds only the two operator-gated endpoints in §3
(`POST /memory/institutional`, `PATCH /memory/institutional/{id}`) and the
approval endpoint already named but not built in Platform Services §2.3
(`POST /prompts/{id}/approve`) — that endpoint's contract does not change
here, only its access-control precondition (`is_platform_operator`, §2) is
now defined.

## 9. Non-Functional Requirements

| Concern | Requirement |
|---|---|
| **Cost attribution** | Playground, Replay Sessions, and Benchmarking invocations against real (non-mock) provider bindings consume real LLM Gateway budget. Every such invocation must be tagged `source = 'house_of_parliament'` (a new `agent_runs` column or equivalent, DDL deferred to `docs/17-AI-Governance/` alongside the Observability & Cost Service it belongs to) so it is excluded from per-proposal and per-ministry cost rollups — House of Parliament testing cost is a platform operating cost, not a proposal cost. |
| **Auditability** | Every Promotion (§4), institutional memory write (§3), and threshold change (§5) is an Audit Event, consistent with EAS §9. |
| **Access** | Gated by `profiles.is_platform_operator` (§2) at the RLS/API layer, not client-side. Not required to be internet-facing production-hardened UI at v1 (internal tool, small operator population), but still requires authenticated access — never unauthenticated. |
| **No production data mutation outside defined writes** | House of Parliament's read modules (§1.2, §1.5, §1.7–§1.10, §1.13) are read-only against production tables. Only §3 (institutional memory) and §4 (prompt promotion) and §5 (threshold changes) write, and each write path is explicitly scoped above — House of Parliament is not a general-purpose admin SQL console. |

## 10. Non-Goals

- Does not become a general database admin console. The Vector Search
  Console (§1.7) is scoped to embedding queries, not arbitrary SQL.
- Does not replace `docs/13-Frontend/`'s production dashboard, and does not
  need production-grade UX polish — it is an operator tool.
- Does not define the full RBAC permission matrix. `is_platform_operator`
  (§2) is a single coarse flag deliberately, pending `docs/16-Security/`.

## 11. Open Items for Product Owner

- **Fine-grained operator permissions** — whether `is_platform_operator`
  should eventually split (e.g. read-only operator vs. full operator, or a
  per-module permission set) is explicitly deferred to `docs/16-Security/`,
  not decided here.
- **Benchmarking budget cap** — whether batch `test_cases` runs need a
  separate spend cap from production LLM Gateway usage, beyond the cost
  *attribution* tagging in §9. Deferred to `docs/17-AI-Governance/`
  (Observability & Cost Service), not yet specified.
- **Vector Search Console query surface** — raw embedding-distance query vs.
  a guided/templated UI is an implementation detail for whoever builds
  `docs/13-`/`docs/14-`, not an architectural blocker to this spec.

## 12. Resolved Decisions

- **Institutional memory curation authority and interface** (previously open
  in Platform Services §8 and Database Schema §14): `profiles.
  is_platform_operator` users, through Memory Explorer (§1.6), per §3.
- **Prompt promotion authority and interface** (previously described only as
  a rule in Platform Services §2.2/§2.3 with no named interface): the same
  `is_platform_operator` flag, through Prompt IDE + Prompt Diff (§1.1, §1.2),
  per §4.
- **Vote of No Confidence threshold authoring interface** (anticipated but
  not specified by ADR-0003): Workflow Builder (§1.4), per §5.
