---
document: Platform Services Specification
version: 1.0
status: APPROVED — approved by Product Owner 12 July 2026; §8's 3 items (institutional memory curation authority, notification channel secret storage, digest scheduling mechanism) remain tracked as follow-ups pending docs/10-/docs/16-/docs/15-, not blockers to implementation
parent: ../../00-EAS-v1.0.md (EAS §3.3 Layer 3 service catalog, §13 priority 4)
related_adrs: ../21-ADRs/0004-intelligence-workspace-integration-depth.md, ../21-ADRs/0006-vector-store-pgvector.md, ../21-ADRs/0007-supabase-as-layer-4-backbone.md
related_specs: ../03-Parliament-Core/Parliament-Core-Specification-v1.0.md, ../11-Database-Schema/Database-Schema-Specification-v1.0.md, ../08-Project-Operations/Project-Operations-Specification-v1.0.md
---

# Platform Services — Specification v1.0

## 0. Scope and Boundary

This spec covers the five Layer 3 services not already specified elsewhere:
**Context Engine, Prompt Registry, Memory Engine, Event Bus, Notification
Engine** (EAS §3.3). Explicitly out of scope, specified elsewhere:

| Service | Lives in |
|---|---|
| Workflow Engine, Agent Runtime | `docs/03-Parliament-Core/` |
| Regulatory Knowledge Layer, Compliance Engine | `docs/05-Regulatory-Knowledge-Layer/` |
| Knowledge Platform (document ingestion, RAG over institutional content) | `docs/06-Knowledge-Platform/` (not yet specified) |
| Observability & Cost Service | `docs/17-AI-Governance/` (not yet specified) — this spec produces the raw data (§3.4, §7) that service aggregates; it does not build the dashboards |

**Knowledge Platform vs. Memory Engine — the boundary that matters most
here, because the two are easy to conflate:** Knowledge Platform holds
*documents* (past proposals, SOPs, lessons-learned narratives) for
general-purpose RAG — large corpus, semantic search, no fixed schema per
item. Memory Engine (§3 below) holds small, *structured, scoped facts* —
short assertions tied to a specific Organisation, Project, Proposal, or
session, written by agents as they work and read back to inform future
runs. A Memory Engine entry might read "Donor X requires budget narratives
in French" (a fact); a Knowledge Platform document is the actual French
budget narrative template itself. Context Engine (§1) queries both and
merges them into one assembled prompt.

## 1. Context Engine

### 1.1 Purpose

Builds the actual prompt an Agent receives: retrieves relevant Memory
Engine entries, Knowledge Platform documents, Regulatory Knowledge Layer
clauses (when the task is compliance-adjacent), and structured entity data
(Donor/Partner/Project profiles from the real, live tables), then assembles
and compresses them into a single context payload within the target model's
token budget.

Per EAS principle 2, ministries do not do this themselves — a ministry
issues a Task; the Agent Runtime calls Context Engine before calling the
LLM Gateway. This is what makes it possible to swap or improve retrieval
logic once, platform-wide, instead of per-ministry.

### 1.2 Position in the invocation pipeline

```
Workflow Engine dispatches Task
        │
        ▼
Agent Runtime resolves Agent (ai_agents) + active AgentVersion (prompt_modules)
        │
        ▼
Context Engine.assemble(agentSlug, targetType, targetId, taskInput)
   → queries Memory Engine (§3), Knowledge Platform, Regulatory Knowledge
     Layer (only if agent.allowed_tools includes 'regulatory_api'), and the
     target entity's own row (Project/Proposal/Donor/Partner)
   → returns { systemPrompt, assembledContext, sources[], tokenEstimate }
        │
        ▼
Agent Runtime calls LLM Gateway with systemPrompt + assembledContext
        │
        ▼
Agent Runtime writes agent_runs row: input_data = the full Context Engine
   output (not just the raw task input) — this is what makes agent_runs a
   complete, replayable audit record (EAS principle 8), not just a log of
   what the user typed
```

`sources[]` in the response is what allows an `AgentInvocation` to cite
*which* Memory entries and Knowledge documents actually influenced an
output — required for the Vote of No Confidence rewrite path (Parliament
Core spec §2.3) to diagnose whether a bad output came from bad retrieval or
a bad prompt.

### 1.3 Data contract

```json
// ContextAssemblyRequest
{
  "agentSlug": "string",
  "targetType": "proposal|project|donor|partner|opportunity",
  "targetId": "uuid",
  "taskInput": "object",
  "tokenBudget": "integer, optional — defaults to the AgentVersion's model context window minus a reserved completion allowance"
}

// ContextAssemblyResponse
{
  "systemPrompt": "string — from prompt_modules.content, unmodified",
  "assembledContext": "string — retrieved + compressed material, ready to append to systemPrompt",
  "sources": [
    { "type": "memory_entry|knowledge_document|regulatory_clause|entity_field", "id": "uuid", "relevance": "number" }
  ],
  "tokenEstimate": "integer",
  "truncated": "boolean — true if retrieval hits were dropped to fit tokenBudget, which sources were dropped is in a 'droppedSources' field for audit"
}
```

### 1.4 API surface

`POST /context/assemble` — the only endpoint this service exposes to the
Agent Runtime. No direct caller outside the Agent Runtime; ministries and
Layer 1 applications never call it directly, per EAS principle 2.

### 1.5 Storage

None of its own. Context Engine is a stateless orchestration function over
Memory Engine, Knowledge Platform, and the real entity tables — it reads,
never writes, except for the `droppedSources` audit note that rides along
inside `agent_runs.input_data` (no separate table).

## 2. Prompt Registry

### 2.1 Purpose — extends `prompt_modules`, not a new table

Per ADR-0007's consequences, `prompt_modules` (docs/11-Database-Schema §3)
is already the physical `AgentVersion` table, extended with
`model_provider`, `model_name`, `status`. The EAS domain model (§4) also
requires a Prompt/Prompt Version to carry **author, approval state,
variables, and test cases** — not yet present on `prompt_modules`. This
spec proposes a second, later additive migration onto the same table
(migration order: after `docs/11`'s §3 extension, before this service goes
live):

```sql
alter table public.prompt_modules add column author_id uuid references auth.users(id);
alter table public.prompt_modules add column approval_state text not null default 'draft'
  check (approval_state in ('draft','pending_review','approved','deprecated'));
alter table public.prompt_modules add column variables jsonb default '[]';   -- named template variables + type + required flag
alter table public.prompt_modules add column test_cases jsonb default '[]'; -- {input, expectedCriteria} pairs for House of Parliament's eval harness
alter table public.prompt_modules add column rolled_back_from uuid references public.prompt_modules(id);
```

This is recorded here as the authoritative definition and should be
appended to `docs/11-Database-Schema/` §3 as a labelled follow-on migration
(same table, second pass) rather than duplicated there — `docs/11` remains
the single source of truth for all DDL; this spec describes the business
contract the columns exist to serve.

### 2.2 Versioning model

A new `AgentVersion` (`prompt_modules` row) is always an `insert`, never an
`update` to an existing row's `content` — this is what makes rollback and
audit trail meaningful (EAS principle 8: prompts are versioned software
artefacts, not mutable config). Business rules:

- Creating version *n+1* for an Agent sets it `approval_state = 'draft'`;
  the currently `status = 'active'` row (if any) is untouched and keeps
  serving invocations until the new version is explicitly promoted.
- **Promotion** (`draft`/`pending_review` → `approved` + `status = 'active'`)
  requires a human action (House of Parliament UI, `docs/10-`) — no agent or
  workflow can self-promote its own prompt version. This is the same
  human-in-the-loop principle (EAS principle 4) applied to prompt changes,
  not just proposal content.
- Promoting a new version automatically sets the previously-active version's
  `status` to `'deprecated'` — exactly one `active` row per Agent at a time,
  enforced by a partial unique index (`unique (agent_id) where status =
  'active'`), not application discipline alone.
- **Rollback** is promoting a previously-deprecated version again, with
  `rolled_back_from` set to the version being rolled back *from* — the
  append-only history is preserved; nothing is deleted or un-deprecated
  silently.

### 2.3 API surface

`POST /prompts` (create draft version), `POST /prompts/{id}/submit-review`,
`POST /prompts/{id}/approve` (human-gated, House of Parliament), `POST
/prompts/{id}/rollback`, `GET /prompts?agentId=` (version history), `GET
/prompts/active?agentId=` (what Context Engine/Agent Runtime actually
resolve at invocation time).

### 2.4 Migration of the four hardcoded prompts

Per `docs/08-Project-Operations/` §6, the four existing edge functions
(`me-agent`, `compliance-agent`, `reporting-agent`, `proposal-agent`) have
their prompts inline in `index.ts`. This spec's data migration (not schema
migration): insert each as a `prompt_modules` row, `version = 1`,
`approval_state = 'approved'`, `status = 'active'`, `author_id` = the
Product Owner's user ID (attributing the existing, working prompts to their
actual origin rather than leaving `author_id` null) — this is what allows
the edge functions to be switched from hardcoded strings to a `prompt_
modules` query without a content change on day one, per `docs/08-` §6's
"fetch-then-call instead of inline-template-then-call" plan.

## 3. Memory Engine

### 3.1 Purpose and the five-tier model

Per EAS §4, the platform needs long-term (institutional), working
(session), project, proposal, and organisation memory. Rather than five
separate tables — which would duplicate the same read/write/expiry
mechanics five times — this spec proposes **one new table**,
`memory_entries`, with a `tier` discriminator and a nullable `scope_id`
whose meaning depends on the tier:

| Tier | `scope_id` references | Populated by | Cleared |
|---|---|---|---|
| `institutional` | *(null — not organisation-scoped)* | Curated, cross-tenant lessons about donor/sector conventions that hold regardless of which CSO is asking (e.g. "EU calls typically close on Thursdays"). Deliberately narrow — this is not where Knowledge Platform's document corpus lives; see §0. | Never automatically — amended only by explicit curation, not by every agent run |
| `organisation` | `organisations.id` | Agent runs, accumulating durable facts specific to this consultancy's donors/clients/patterns (e.g. "Donor Y always requires a 2-page executive summary") | Never automatically |
| `project` | `projects.id` | Agent runs during post-award delivery (recurring risk patterns, M&E findings that should inform the next reporting cycle) | On project closure, archived not deleted (retained for the audit period, EAS §9) |
| `proposal` | `proposals.id` | Agent runs during drafting (decisions made, why a section was written a certain way, so a later drafting pass doesn't re-litigate a settled choice) | On proposal award/rejection, archived |
| `working` | `workflow_instances.id` | The current Workflow Instance's in-progress state — the closest tier to a session cache | TTL-based: cleared automatically once the Workflow Instance reaches a terminal state (`completed`/`failed`/`cancelled`, Parliament Core spec §2.2), plus a hard 30-day expiry regardless of state as a safety net against orphaned instances |

**Why `institutional` is deliberately narrow:** conflating it with the
Knowledge Platform's full document corpus would duplicate that service.
`institutional` memory is for short, curated, structured assertions only —
the kind of thing a senior consultant would say out loud, not a document to
retrieve. It has no automatic write path in v1; it starts empty and is
populated only by explicit Product Owner / House of Parliament curation.
This is a deliberate v1 scope limit, not an oversight — automatic
promotion of organisation-tier facts to institutional-tier (cross-tenant)
raises a real data-boundary question (one CSO's donor intelligence becoming
another's default assumption) that is out of scope until multi-org tenancy
is actually built (`docs/08-Project-Operations/` §5 defers that
explicitly).

### 3.2 Data contract / DDL

```sql
create table public.memory_entries (
  id uuid primary key default gen_random_uuid(),
  tier text not null check (tier in ('institutional','organisation','project','proposal','working')),
  scope_id uuid,                              -- null only for tier = 'institutional'
  organisation_id uuid references public.organisations(id),  -- always set except for 'institutional', even when scope_id already implies it, so RLS can filter directly without a join
  content text not null,
  content_type text not null default 'fact' check (content_type in ('fact','decision','preference','risk_pattern')),
  embedding vector(1536),                      -- semantic recall, ADR-0006
  confidence numeric check (confidence between 0 and 1),
  source_agent_run_id uuid references public.agent_runs(id),  -- which invocation produced this fact, for audit and for the Vote of No Confidence rewrite path to trace bad memory back to its origin
  superseded_by uuid references public.memory_entries(id),    -- facts are corrected by superseding, not edited in place
  created_at timestamptz not null default now(),
  expires_at timestamptz                       -- set only for tier = 'working'
);
create index on public.memory_entries using hnsw (embedding vector_cosine_ops);
create index on public.memory_entries (tier, scope_id);

alter table public.memory_entries enable row level security;
create policy "memory_entries_select" on public.memory_entries for select
  to authenticated using (
    tier = 'institutional' or organisation_id in (
      select organisation_id from public.organisation_members where user_id = auth.uid()
    )
  );

-- append-by-correction, not free edit — content is never UPDATEd in place
revoke update on public.memory_entries from authenticated;
```

This is a new table with no existing equivalent in the Intelligence
Workspace schema — should be appended to `docs/11-Database-Schema/` as a
labelled Platform Services Domain addition (§11 there), keeping that
document the single consolidated schema source per its own stated purpose.

### 3.3 API surface

`POST /memory/entries` (write — used by the Agent Runtime after an
invocation completes, not by ministries directly), `GET /memory/entries?
tier=&scopeId=&query=&limit=` (semantic + filtered retrieval, the primary
call Context Engine makes), `POST /memory/entries/{id}/supersede` (correct
a fact), `POST /memory/working/{workflowInstanceId}/clear` (explicit early
clear, in addition to the automatic TTL/terminal-state clear).

### 3.4 Relationship to the audit trail

A `memory_entries` write is not itself an `Audit Event` (`audit_events`,
`docs/11` §7) — it's a derived artefact of an `AgentInvocation`, already
covered by that invocation's `agent_runs` row via `source_agent_run_id`.
Duplicating it into `audit_events` as well would be redundant, not
additional rigor.

## 4. Event Bus

### 4.1 Purpose

Every service action that another service or application might care about
emits an event; subscribers listen instead of being called directly (EAS
§3.3). This decouples, for instance, the Workflow Engine reaching a Human
Gate from the Notification Engine's need to alert a reviewer — the
Workflow Engine doesn't know or care that a notification will be sent, it
only emits `workflow_instance.awaiting_human`.

### 4.2 Mechanism — Supabase Realtime over a new table, not a separate queue

Per `docs/15-Infrastructure/`'s lean toward Supabase's built-in primitives
over introducing Redis prematurely, the Event Bus is a new append-only
table, `platform_events`, with Supabase Realtime enabled — subscribers
listen to `INSERT`s via a Realtime channel rather than polling. This is
sufficient at v1 scale (single-digit ministries, one consultancy tenant)
and defers the Redis/queue question to whenever `docs/15-`'s open item on
that is actually revisited, rather than deciding it here.

```sql
create table public.platform_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  event_type text not null,           -- e.g. 'workflow_instance.awaiting_human', 'agent_run.completed', 'compliance_finding.fail'
  source_service text not null,
  target_type text,
  target_id uuid,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.platform_events (organisation_id, event_type, created_at);
alter table public.platform_events enable row level security;
create policy "platform_events_select" on public.platform_events for select
  to authenticated using (organisation_id in (
    select organisation_id from public.organisation_members where user_id = auth.uid()
  ));
revoke update, delete on public.platform_events from authenticated;
-- enable Realtime publication for this table (Supabase project config, not DDL)
```

**Distinct from `audit_events` (`docs/11` §7):** `audit_events` is the
governance/compliance audit trail — who did what, for legal and oversight
purposes, queried rarely and retained long-term. `platform_events` is an
operational pub/sub mechanism — queried constantly by live subscribers,
retention can be much shorter (a rolling 90-day window is sufficient; a
scheduled `pg_cron` job prunes older rows, which is fine precisely because
this table is not the audit record). Some state changes reasonably produce
both a `platform_events` row (for live subscribers) and an `audit_events`
row (for the permanent record) — that overlap is intentional, not
duplication to eliminate, because the two tables serve different retention
and access patterns.

### 4.3 Event taxonomy (v1, extensible)

`workflow_instance.state_changed`, `workflow_instance.awaiting_human`,
`agent_run.completed`, `agent_run.failed`, `compliance_finding.fail`,
`compliance_finding.needs_review`, `prompt_module.promoted`, `report.
pending_human_review` (the new `submission_status` field from `docs/08-
Project-Operations/` §7). Each `event_type` is a documented, versioned
string, not a free-form value — new event types are added via a spec
amendment (a short addition to this section), not invented ad hoc by
whichever service happens to need one.

### 4.4 API surface

`POST /events/emit` (called by any Layer 2/3 service — a thin insert
wrapper), subscription is via the Supabase Realtime client SDK directly
(no bespoke subscribe endpoint needed).

## 5. Notification Engine

### 5.1 Purpose

Dispatches email/Slack/Teams/push for deadlines, digests, gate approvals,
and veto failures — the human-facing side of the Event Bus. It is a
**subscriber** to `platform_events`, not a service other components call
directly for one-off messages (that would recreate direct coupling the
Event Bus exists to remove).

### 5.2 Data contract / DDL

```sql
create table public.notification_channels (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  user_id uuid references auth.users(id),      -- null = organisation-wide channel (e.g. a shared Slack webhook)
  channel_type text not null check (channel_type in ('email','slack','teams','push')),
  config jsonb not null,                        -- address, webhook URL, etc. — never a secret in plaintext (docs/16-Security/ owns encryption-at-rest requirements)
  active boolean not null default true
);

create table public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  event_type text not null,                     -- matches platform_events.event_type
  channel_id uuid not null references public.notification_channels(id),
  delivery_mode text not null default 'immediate' check (delivery_mode in ('immediate','daily_digest','weekly_digest'))
);

create table public.notification_log (   -- append-only
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  platform_event_id uuid references public.platform_events(id),
  channel_id uuid not null references public.notification_channels(id),
  status text not null check (status in ('sent','failed','suppressed_digest_pending')),
  sent_at timestamptz,
  error_message text
);
revoke update, delete on public.notification_log from authenticated;
```

Delivery mechanism itself (SMTP/Slack API/Teams webhook client calls) is an
Edge Function subscribing to `platform_events` via Realtime, matching
against `notification_rules`, and writing `notification_log` — an
implementation detail for Claude Code to build against this contract, not
architecture to specify further here.

### 5.3 API surface

`POST /notifications/channels`, `PUT /notifications/channels/{id}`, `POST
/notifications/rules`, `GET /notifications/log?organisationId=&status=`
(delivery audit/debugging). No `POST /notifications/send` — sending is
always rule-driven from an event, never an ad hoc direct call, per §5.1.

## 6. Cross-Service Sequence — Worked Example

To make the five services' interaction concrete: a ministry's Workflow
Engine dispatches a `Task` to the Reporting agent for a donor-facing
interim narrative.

1. Agent Runtime resolves `ai_agents` row for `reporting-agent`, active
   `prompt_modules` row.
2. Agent Runtime calls **Context Engine** → assembles system prompt +
   retrieved `memory_entries` (tier `project`, this project's recurring
   M&E findings) + relevant `regulatory_clauses` (Annex VI template rules)
   + the real `projects`/`indicators`/`activities` rows.
3. Agent Runtime calls LLM Gateway, writes `agent_runs` (per `docs/08-` §6,
   now including `prompt_module_id`, `token_cost`, `latency_ms`).
4. Agent Runtime writes a new `memory_entries` row (tier `project`) if the
   invocation surfaced a durable fact worth retaining, with `source_agent_
   run_id` set.
5. Workflow Engine sets the resulting `reports` row's `submission_status =
   'pending_human_review'` (`docs/08-` §7) and emits `report.pending_human_
   review` to the **Event Bus**.
6. **Notification Engine**, subscribed via a `notification_rules` row for
   that `event_type`, sends an immediate Slack message to the assigned
   reviewer's `notification_channels` entry, and writes `notification_log`.

Nothing in this sequence required a ministry or the Reporting agent itself
to know about Slack, memory storage, or the audit trail — each concern is a
platform service the Agent Runtime and Workflow Engine call into, per EAS
principle 2.

## 7. Non-Functional Requirements

| Concern | Requirement |
|---|---|
| **Token budget discipline** | Context Engine must respect `tokenBudget` strictly — a truncated context (§1.3 `truncated: true`) is preferable to a failed model call, and every truncation is logged for the Observability & Cost Service (`docs/17-`) to flag if it happens often for a given Agent, which signals the prompt or retrieval needs tuning. |
| **Memory correctness over completeness** | A `memory_entries` write with `confidence` below a threshold (default 0.6, matching the Regulatory Knowledge Layer's extraction-confidence convention, `docs/05-` §8) should not be surfaced by Context Engine without a `needs_review`-equivalent flag — prevents a low-confidence agent guess from silently becoming "institutional knowledge" two retrieval hops later. |
| **Event delivery is at-least-once, not exactly-once** | Notification Engine's Edge Function subscriber must be idempotent (check `notification_log` for an existing `sent` row for the same `platform_event_id` + `channel_id` before sending) — Supabase Realtime does not guarantee exactly-once delivery. |
| **Multi-tenancy** | Every new table in this spec carries `organisation_id` and RLS, consistent with ADR-0005, except `memory_entries` tier `institutional` and `prompt_modules` (Agent/AgentVersion are platform-global by design, per Parliament Core spec §3.6). |
| **Retention** | `platform_events`: 90-day rolling window. `memory_entries`, `notification_log`: retained for the platform's standard 5-year audit period (EAS §9) since both can be relevant to reconstructing why an agent produced a given output. |

## 8. Open Items for Product Owner

- ~~**Institutional memory curation workflow**~~ (§3.1) — **addressed**,
  `docs/10-House-of-Parliament/House-of-Parliament-Specification-v1.0.md`
  §3 (pending Product Owner approval of that spec): `profiles.
  is_platform_operator` users, via the Memory Explorer module. Adds a
  `memory_entries.justification` column as a labelled follow-on migration.
- ~~**Notification channel secrets**~~ — **addressed**,
  `docs/16-Security/Security-Specification-v1.0.md` §5 (pending Product
  Owner approval of that spec): Supabase Vault via a new
  `notification_channels.config_secret_id` column; `config` retains only
  non-sensitive metadata.
- **Digest delivery scheduling mechanism** (`notification_rules.delivery_
  mode`) — `pg_cron` on Supabase is the likely implementation, consistent
  with `docs/15-`'s lean toward built-in primitives, but not yet confirmed
  against that spec's still-open Redis/queue question.
