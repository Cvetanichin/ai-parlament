---
document: Database Schema Specification
version: 1.5
status: APPROVED — approved by Product Owner 12 July 2026; v1.5 folds in follow-on migrations from AI Governance (§16); §14's 3 remaining items (JSONB scope, agent_runs status-update mechanism, PITR window) are tracked follow-ups deferred to future review, not blockers to implementation
parent: ../../00-EAS-v1.0.md (EAS §4 domain model, §13 priority 3)
related_adrs: ../21-ADRs/0005-multi-tenancy-built-in-day-one.md, ../21-ADRs/0006-vector-store-pgvector.md, ../21-ADRs/0007-supabase-as-layer-4-backbone.md
consolidates: EAS §4, Grant Studio spec §2-§11, Regulatory Knowledge Layer spec §5, Parliament Core spec §2.6/§3.6, Project Operations spec §1-§7, Platform Services spec §1-§5, Knowledge Platform spec §3/§6, House of Parliament spec §7, Security spec §5/§7, Grant Studio spec §3.1/§6.1/§8.1/§9.1/§10.1, AI Governance spec §1.2/§2.1
---

# Database Schema — Specification v1.5

## 0. Purpose and Scope — Revised Following ADR-0007

**ADR-0007 is Accepted:** the platform's Layer 3/4 schema lives inside the
Intelligence Workspace's existing Supabase project — one system of record,
not two. This revises v1.0 of this spec, which had assumed a fresh
PostgreSQL instance. The governing rule for every table below is now:

> **If a real table already exists for a concept (confirmed by direct code
> inspection, `docs/08-Project-Operations/Project-Operations-Specification-
> v1.0.md` §1), extend it additively. Only create a new table for a concept
> that genuinely has no existing home.**

This is ADR-0004's "additive only" constraint applied at the schema level:
every `ALTER TABLE` below adds columns; none renames, drops, or retypes an
existing column. Existing application code (the four edge functions, the
React frontend) continues to work unmodified against every table it already
uses — new columns are additive and nullable/defaulted, never introduced as
`NOT NULL` without a default on a table with existing rows.

Migration tooling is the Supabase CLI (`supabase/migrations/*.sql`) —
already the live repo's convention, confirmed rather than chosen fresh.
Every migration in this spec is written to run through a Supabase branch
(or cloned staging project) first, per ADR-0007's mandatory mitigation —
this is a deployment-process requirement (`docs/19-Deployment/`), not
optional discipline.

## 1. Multi-Tenancy Migration (ADR-0005, retrofitted per ADR-0007)

This is the first migration, before any Layer 3 table is added, because
every other table in this spec carries `organisation_id`.

```sql
-- 1a. New table
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.organisations enable row level security;
create policy "organisations_select" on public.organisations for select
  to authenticated using (id in (
    select organisation_id from public.organisation_members where user_id = auth.uid()
  ));

create table public.organisation_members (
  organisation_id uuid not null references public.organisations(id),
  user_id uuid not null references auth.users(id),
  role text not null default 'member',
  primary key (organisation_id, user_id)
);
alter table public.organisation_members enable row level security;
create policy "organisation_members_select" on public.organisation_members
  for select to authenticated using (user_id = auth.uid());

-- 1b. Backfill: one organisation per existing distinct created_by
insert into public.organisations (id, name)
select gen_random_uuid(), coalesce(u.email, 'Organisation ' || u.id::text)
from (select distinct created_by as id_user from public.projects where created_by is not null) x
join auth.users u on u.id = x.id_user;
-- (illustrative — Claude Code should write this as a proper migration script
-- keyed on actual distinct created_by values across all owner-scoped tables,
-- not just projects, and populate organisation_members accordingly)

-- 1c. Additive column + dual RLS on every existing tenant-scoped table
alter table public.clients            add column organisation_id uuid references public.organisations(id);
alter table public.projects           add column organisation_id uuid references public.organisations(id);
alter table public.activities         add column organisation_id uuid references public.organisations(id);
alter table public.indicators         add column organisation_id uuid references public.organisations(id);
alter table public.risks              add column organisation_id uuid references public.organisations(id);
alter table public.deliverables       add column organisation_id uuid references public.organisations(id);
alter table public.project_documents  add column organisation_id uuid references public.organisations(id);
alter table public.reports            add column organisation_id uuid references public.organisations(id);
alter table public.agent_runs         add column organisation_id uuid references public.organisations(id);

-- example dual-policy pattern (applied per table): existing policy stays,
-- new policy added alongside with OR semantics via a combined USING clause
-- rather than dropping the original — Claude Code should generate the
-- specific ALTER POLICY / CREATE POLICY statements per table, following
-- this pattern:
--   using (created_by = auth.uid() or organisation_id in (
--     select organisation_id from organisation_members where user_id = auth.uid()
--   ))
```

A full cutover to organisation-scoped-only RLS (dropping the `created_by`
clause) is a deliberate, separate, later migration — not part of this spec.
Single-tenant operation is unaffected: with one `Organisation` row, this is
structurally present but operationally invisible until a second tenant
exists.

## 2. Identity

`auth.users` (Supabase-managed) and `public.profiles` (already exists —
`plan`, `ai_runs_used`, `ai_runs_reset_at`, billing customer ID) are the
identity/subscription tables. No changes proposed here. `organisation_members.
role` (§1) is the coarse RBAC field; full permission-matrix detail remains
`docs/16-Security/`'s job.

## 3. Workflow Engine & Agent Runtime — Extends `ai_agents` / `prompt_modules` / `agent_runs`

Per ADR-0007's consequences: these are **not** new tables. They are the real,
live tables, extended.

```sql
-- Agent = ai_agents, extended
alter table public.ai_agents add column allowed_tools text[] not null default '{}';

-- AgentVersion = prompt_modules, extended (was already close: agent_id,
-- content, version — this is the Prompt Registry table the edge functions
-- should have been querying all along, per Project Operations spec §2.3)
alter table public.prompt_modules add column model_provider text not null default 'anthropic';
alter table public.prompt_modules add column model_name text not null default 'claude-sonnet-4-6';
alter table public.prompt_modules add column status text not null default 'active'
  check (status in ('active','deprecated'));

-- Data migration (not schema): insert the four currently-hardcoded prompts
-- as prompt_modules rows, version 1, status active, linked to their
-- ai_agents row (including registering proposal-agent, which currently has
-- no ai_agents row at all — see Project Operations spec §1.2)

-- AgentInvocation = agent_runs, extended
alter table public.agent_runs add column prompt_module_id uuid references public.prompt_modules(id);
alter table public.agent_runs add column token_cost numeric;
alter table public.agent_runs add column latency_ms int;
```

New Layer 3 tables (no existing equivalent):

```sql
create table public.workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version int not null,
  states jsonb not null,
  transitions jsonb not null,
  vote_of_no_confidence_threshold int not null default 2,
  gates jsonb not null,
  unique (name, version)
);
-- platform-global, no organisation_id

create table public.workflow_instances (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  workflow_definition_id uuid not null references public.workflow_definitions(id),
  target_type text not null,
  target_id uuid not null,
  state text not null,
  vote_of_no_confidence_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workflow_instance_history (   -- append-only
  id uuid primary key default gen_random_uuid(),
  workflow_instance_id uuid not null references public.workflow_instances(id),
  state text not null,
  entered_at timestamptz not null default now(),
  reason text
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  workflow_instance_id uuid not null references public.workflow_instances(id),
  ministry text not null,
  depends_on uuid[] default '{}',
  status text not null check (status in ('pending','running','succeeded','failed')),
  agent_run_id uuid references public.agent_runs(id),  -- reuses the real table, not a fresh 'agent_invocations'
  retry_count int not null default 0
);
```

**Naming note:** Parliament Core spec §3.6 names this table `agent_invocations`
in the abstract. The physical implementation is `agent_runs` (extended, §3
above) — Claude Code should treat `agent_runs` as the authoritative table
name throughout, updating cross-references in the Parliament Core spec's
data-contract section as a documentation fix, not a schema change.

## 4. Regulatory Knowledge Layer — new tables (platform-global, no `organisation_id`)

No existing equivalent in Intelligence Workspace; unchanged from v1.0 of this
spec:

```sql
create extension if not exists vector;  -- pgvector, ADR-0006; Supabase supports this natively

create table public.regulatory_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in
    ('eu_prag','eu_contract','eu_guidelines','eu_application',
     'organisation_policy','national_law','internal_learned','ai_governance')),
  version text not null,
  effective_date date,
  supersedes uuid references public.regulatory_documents(id),
  jurisdiction text,
  source_url text,
  ingested_at timestamptz not null default now()
);

create table public.regulatory_clauses (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.regulatory_documents(id),
  document_version text not null,
  section text,
  page int,
  text text not null,
  embedding vector(1536),   -- confirmed default: OpenAI text-embedding-3-small dimension; swappable via ADR if a different model is chosen
  obligation_type text check (obligation_type in
    ('mandatory','recommended','prohibited','context_dependent')),
  extraction_confidence numeric check (extraction_confidence between 0 and 1),
  related_clauses uuid[] default '{}',
  superseded_by uuid references public.regulatory_clauses(id),
  review_status text not null default 'auto_confirmed'
    check (review_status in ('auto_confirmed','needs_human_review','human_confirmed'))
);
create index on public.regulatory_clauses using hnsw (embedding vector_cosine_ops);

create table public.compliance_findings (   -- append-only
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  artefact_type text not null,
  artefact_id uuid not null,
  clause_id uuid not null references public.regulatory_clauses(id),
  rule text not null,
  source text not null,
  severity text not null check (severity in ('mandatory','recommended','info')),
  status text not null check (status in
    ('pass','warning','fail','context_dependent','needs_review')),
  flags jsonb default '[]',
  created_at timestamptz not null default now()
);
```

## 5. Grant Studio Domain — Real Tables Extended + Genuinely New Tables

### 5.1 Extended (real, live tables — additive columns only)

```sql
-- clients: working definition confirmed (Project Operations spec §2.4) as
-- the CSOs this consultancy serves
alter table public.clients add column areas_of_interest text;

-- projects: already has budget_total/budget_spent, donor, grant_reference —
-- richer than this spec's v1.0 draft assumed. Add only what's missing:
alter table public.projects add column stage text
  check (stage in ('pre_award','post_award')) default 'post_award';
alter table public.projects add column opportunity_id uuid;  -- FK added once opportunities table exists (5.2)
alter table public.projects add column prag_version text not null default '2025';  -- Regulatory Knowledge Layer spec §2.2/§12 — legacy-PRAG fallback mechanism; a project predating PRAG 2025 is flagged here, not silently checked against the wrong corpus version

-- indicators: already matches Logframe Studio's field list closely
  -- (baseline, target, actual, data_source, collection_method, frequency).
  -- No changes needed.

-- risks, activities, deliverables, project_documents, reports: no schema
  -- changes needed beyond organisation_id (§1). reports.report_type already
  -- accommodates 'monthly_report' | 'me_brief' | 'compliance_review' —
  -- extend the CHECK constraint (if one exists) to also allow
  -- 'interim_narrative' | 'final_narrative' for Reporting Studio's mandatory
  -- EU templates (Grant Studio spec §9), rather than introducing a parallel
  -- reports-like table.
```

### 5.2 Genuinely new (no existing equivalent)

```sql
create table public.donors (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null,
  official_website text,
  region text,
  funder_type text,
  donor_status text check (donor_status in
    ('current_donor','warm_prospect','former_donor','cold_prospect','new_funder','revisit_prospect','disqualified')),
  pipeline_stage text,          -- DFF_Position
  priority text,
  relevance text,
  comments text,
  areas_of_interest text,
  last_action text,
  next_action text,
  relationship_owner uuid references auth.users(id),
  last_updated date
);
-- seeded from 20250904_Donor-Pipeline_Integrated.xlsx (Grant Studio spec §2.3)
-- note: distinct from `clients` — donors fund projects, clients are served by them

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  donor_id uuid references public.donors(id),
  external_id text,
  cluster text,
  is_new boolean default false,
  title text not null,
  description text,
  tags text[] default '{}',
  tag_confidence jsonb,
  eligibility_summary text,
  region text,
  funding_type text,
  application_type text,
  amount_min numeric,
  amount_max numeric,
  currency text,
  deadline date,
  status text check (status in ('open','forthcoming','rolling','closed','archived')),
  strategic_narrative text,     -- AI-generated, human-review-required (ADR-0002)
  risk_score numeric,
  relevance_score numeric,
  source_url text,
  scrape_note text,
  version int not null default 1,
  flags jsonb default '[]',
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index on public.opportunities using hnsw (embedding vector_cosine_ops);
alter table public.projects add constraint projects_opportunity_id_fkey
  foreign key (opportunity_id) references public.opportunities(id);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  opportunity_id uuid not null references public.opportunities(id),
  client_id uuid references public.clients(id),   -- which client this proposal is prepared for
  stage text check (stage in ('concept_note','full_application')),
  status text not null,
  version int not null default 1,
  created_at timestamptz not null default now()
);
-- on award, a proposal graduates into a real `projects` row
-- (projects.opportunity_id links back, per 5.1)

create table public.proposal_sections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  proposal_id uuid not null references public.proposals(id),
  section_key text not null,
  content text,
  workflow_instance_id uuid references public.workflow_instances(id)
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  proposal_id uuid references public.proposals(id),
  project_id uuid references public.projects(id),   -- budgets persist post-award too (budget_spent tracking)
  line_items jsonb not null,
  indirect_cost_rate numeric,
  currency text
);

create table public.partners (   -- ADR-0001 dual pre-award/post-award mandate
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  proposal_id uuid references public.proposals(id),
  project_id uuid references public.projects(id),
  legal_name text not null,
  pic_pador text,
  role text check (role in ('lead_applicant','co_applicant','associate')),
  lef_status text,
  fif_status text,
  declaration_of_honour_status text,
  due_diligence_status text,
  subcontract_value numeric,
  due_diligence_refresh_date date,
  performance_rating numeric
);
```

### 5.3 Dropped from v1.0 of this spec

`logframes` (generic JSONB blob) is **not** created — the real `indicators`
and `activities` tables already normalise most of what it would have held,
better than a JSONB blob would have. A narrow `logframe_narratives` table
covers only the prose Logframe Studio needs that has no home in `indicators`/
`activities` (Theory of Change statement, cross-cutting assumptions):

```sql
create table public.logframe_narratives (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  proposal_id uuid references public.proposals(id),
  project_id uuid references public.projects(id),
  theory_of_change text,
  assumptions text,
  intervention_logic jsonb   -- objective/result hierarchy — the one piece still reasonably JSONB, since it's a tree, not a flat record set
);
```

## 6. Knowledge Platform — new table

```sql
create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  title text not null,
  source text,
  content text,
  embedding vector(1536),
  ingested_at timestamptz not null default now()
);
create index on public.knowledge_documents using hnsw (embedding vector_cosine_ops);
```

Distinct from `project_documents` (real, existing — project-scoped file
metadata) — this is org-wide institutional knowledge, not tied to one
project. Placeholder-level detail pending `docs/06-Knowledge-Platform/`.

## 7. Audit Log

Distinct from `workflow_instance_history` (§3) and `compliance_findings`
(§4). New table — `agent_runs` (§3) already covers agent-invocation-level
audit; this covers everything else (human gate decisions, workflow state
changes originating outside an agent call):

```sql
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  actor_type text not null check (actor_type in ('agent','human','system')),
  actor_id uuid,
  action text not null,
  target_type text,
  target_id uuid,
  agent_run_id uuid references public.agent_runs(id),
  detail jsonb,
  created_at timestamptz not null default now()
);

-- append-only enforcement — database-level, not application discipline
revoke update, delete on public.audit_events from authenticated;
revoke update, delete on public.agent_runs from authenticated;      -- except the status-update path edge functions need — grant a narrow function-level exception, not a blanket UPDATE grant
revoke update, delete on public.compliance_findings from authenticated;
revoke update, delete on public.workflow_instance_history from authenticated;
```

The `agent_runs` exception matters: the real edge functions today do
`update agent_runs set status = 'completed', ...` after a run — a blanket
`revoke update` would break existing code. Claude Code should implement this
via a `security definer` function edge functions call to transition status
(`pending → running → completed/error` only, no other columns), rather than
a raw table grant — preserves append-only-in-spirit while keeping the real
functions working unmodified in their calling convention.

## 8. Migration Strategy

1. **Order:** §1 (multi-tenancy) → §3 (Agent Runtime extensions + new
   Workflow Engine tables) → §4 (Regulatory Knowledge Layer) → §5 (Grant
   Studio extensions + new tables) → §6 (Knowledge Platform) → §7 (Audit).
2. **Every migration runs against a Supabase branch first** (ADR-0007
   mitigation) — apply, run the existing test suite (none currently exists
   per the connected repo's `CLAUDE.md`; writing one is in scope for
   `docs/18-Testing/`) and a manual smoke test of all four edge functions,
   then promote.
3. **Tooling:** Supabase CLI, `supabase/migrations/*.sql` — confirmed, not
   chosen fresh; resolves the open tooling question from v1.0 of this spec.
4. **From `backend/store.js`** (the *other* existing asset, the
   `parliamentary-ai-gov` MVP scaffold): that in-memory store's audit log
   maps to `workflow_instance_history` + `audit_events` (§3, §7) once the
   Parliament Core spec (`docs/03-`) is re-platformed to call into this same
   Supabase project rather than its own separate state — this is now the
   correct target given ADR-0007, superseding that spec's earlier assumption
   of an independent database.

## 9. Non-Functional Requirements

| Concern | Requirement |
|---|---|
| **RLS coverage** | Every tenant-scoped table — real and new — must have its dual RLS policy (§1) verified by an automated test before merge. |
| **Migration reversibility** | Every migration has a tested `down` path, except append-only table creation and the `organisation_id` backfill (§1), which is forward-only by design. |
| **Backup / PITR** | Supabase's point-in-time recovery must cover the 5-year audit retention requirement (EAS §9) — confirm the project's current PITR retention window is sufficient or needs a plan upgrade. |
| **Vector index maintenance** | `HNSW` indexes on `regulatory_clauses`, `opportunities`, and `knowledge_documents` need a re-index plan if the embedding model changes — `docs/19-Deployment/` runbook item. |
| **Blast radius** | No migration in §1, §3, or §5 (the sections touching real, live tables) may be applied directly to production — staging-branch validation is mandatory per ADR-0007, not discretionary. |

## 11. Platform Services Domain (added v1.2, from `docs/04-Platform-Services/`)

Migration order: after §1 (multi-tenancy) and §3 (Agent Runtime), before
any Platform Services API goes live. All four new tables are additive; the
one `ALTER TABLE` here is a second, later pass over `prompt_modules` — not
a change to the columns §3 already added.

```sql
-- 11a. Prompt Registry — second pass over prompt_modules (Platform Services spec §2.1)
alter table public.prompt_modules add column author_id uuid references auth.users(id);
alter table public.prompt_modules add column approval_state text not null default 'draft'
  check (approval_state in ('draft','pending_review','approved','deprecated'));
alter table public.prompt_modules add column variables jsonb default '[]';
alter table public.prompt_modules add column test_cases jsonb default '[]';
alter table public.prompt_modules add column rolled_back_from uuid references public.prompt_modules(id);
create unique index prompt_modules_one_active_per_agent
  on public.prompt_modules (agent_id) where (status = 'active');

-- 11b. Memory Engine (Platform Services spec §3.2)
create table public.memory_entries (
  id uuid primary key default gen_random_uuid(),
  tier text not null check (tier in ('institutional','organisation','project','proposal','working')),
  scope_id uuid,
  organisation_id uuid references public.organisations(id),
  content text not null,
  content_type text not null default 'fact' check (content_type in ('fact','decision','preference','risk_pattern')),
  embedding vector(1536),
  confidence numeric check (confidence between 0 and 1),
  source_agent_run_id uuid references public.agent_runs(id),
  superseded_by uuid references public.memory_entries(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz
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
revoke update on public.memory_entries from authenticated;

-- 11c. Event Bus (Platform Services spec §4.2)
create table public.platform_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  event_type text not null,
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
-- enable Realtime publication on this table via Supabase project config, not DDL

-- 11d. Notification Engine (Platform Services spec §5.2)
create table public.notification_channels (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  user_id uuid references auth.users(id),
  channel_type text not null check (channel_type in ('email','slack','teams','push')),
  config jsonb not null,
  active boolean not null default true
);
create table public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  event_type text not null,
  channel_id uuid not null references public.notification_channels(id),
  delivery_mode text not null default 'immediate' check (delivery_mode in ('immediate','daily_digest','weekly_digest'))
);
create table public.notification_log (
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

Retention: `platform_events` is a 90-day rolling window (operational
pub/sub, not the audit record — `audit_events`, §7, remains the permanent
governance trail); `memory_entries` and `notification_log` follow the
platform's standard 5-year retention (EAS §9), same as every other table in
this document.

## 13. Knowledge Platform Domain (added v1.3, from `docs/06-Knowledge-Platform/`)

Migration order: after §6 (which created the original flat `knowledge_
documents` table) and independent of §11 — no dependency between the
Platform Services and Knowledge Platform domains.

```sql
-- extend the existing knowledge_documents table (§6)
alter table public.knowledge_documents add column document_type text not null default 'other'
  check (document_type in ('past_proposal','lessons_learned','evaluation','sop','meeting_notes','template','other'));
alter table public.knowledge_documents add column tags text[] not null default '{}';
alter table public.knowledge_documents add column source_type text not null default 'manual_upload'
  check (source_type in ('google_drive','notion','project_documents','manual_upload'));
alter table public.knowledge_documents add column source_external_id text;
alter table public.knowledge_documents add column supersedes uuid references public.knowledge_documents(id);
alter table public.knowledge_documents add column review_status text not null default 'auto_confirmed'
  check (review_status in ('auto_confirmed','needs_review','human_confirmed'));

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  knowledge_document_id uuid not null references public.knowledge_documents(id),
  chunk_index int not null,
  section_label text,
  content text not null,
  embedding vector(1536)
);
create index on public.knowledge_chunks using hnsw (embedding vector_cosine_ops);

create table public.knowledge_document_links (
  id uuid primary key default gen_random_uuid(),
  knowledge_document_id uuid not null references public.knowledge_documents(id),
  entity_type text not null check (entity_type in ('donor','project','partner','proposal')),
  entity_id uuid not null
);
create index on public.knowledge_document_links (entity_type, entity_id);
```

RLS: `knowledge_chunks` and `knowledge_document_links` inherit access via a
join-based policy against their parent `knowledge_documents.organisation_
id` (§1) rather than carrying a duplicated `organisation_id` column
themselves, since neither child table has meaning independent of its
parent document.

Retention: standard 5-year platform retention (EAS §9), same as every other
table in this document — no shorter operational-only window here, unlike
`platform_events` (§11).

## 14. Open Items for Product Owner

- **`logframe_narratives.intervention_logic` as JSONB** (§5.3) — acceptable
  at v1 scale; revisit once Logframe Studio (Grant Studio §6) is actually
  built out and real usage patterns are known.
- **`agent_runs` status-update exception** (§7) — confirm the `security
  definer` function approach, or propose an alternative that preserves both
  append-only auditability and the existing edge functions' working calling
  convention.
- **PITR retention window** (§9) — confirm current Supabase plan's setting
  meets the 5-year requirement; may require a plan upgrade, which is a cost
  decision, not purely technical.

Resolved since v1.3 (12 July 2026, same day as the specs that closed them —
see §15 for the consolidated DDL):

- ~~**Institutional memory curation workflow**~~ (§11b / Platform Services
  spec §3.1, §8) — `docs/10-House-of-Parliament/` §3: `profiles.
  is_platform_operator` users only, via Memory Explorer.
- ~~**Notification channel secret storage**~~ (§11d / Platform Services spec
  §5.2, §8) — `docs/16-Security/` §5: Supabase Vault via
  `notification_channels.config_secret_id`.
- ~~**RBAC permission matrix**~~ (§2) — `docs/16-Security/` §2: four-role
  Organisation-scoped enum (`owner`/`admin`/`member`/`viewer`) plus the
  `is_platform_operator` platform-level boundary.
- ~~**Consortium Builder post-award ministry assignment**~~ — `docs/07-
  Grant-Studio/` §4.3: joint Partner Management Committee (Procurement,
  Finance & Administration, Compliance, M&E).

Resolved since v1.0: embedding dimension (1536, OpenAI-style, confirmed
default), migration tooling (Supabase CLI, confirmed), the `projects`
table's system of record (the real table, extended — ADR-0007), and the
Knowledge Platform seed corpus (a dedicated Google Drive folder, now
created — Knowledge Platform spec §1) — the latter also added a
`review_status` column to `knowledge_documents` (§13) backing that spec's
now-decided Template Detection confidence threshold.

## 15. Follow-On Migrations from House of Parliament, Security, and Grant Studio (v1.4)

Consolidated here as the single DDL source of truth, per this document's own
governing rule (§0) — the three specs above state the business contract;
this section is what actually gets migrated. All are additive (new columns
or new tables), none touch an existing column, consistent with every prior
migration in this document.

### 15.1 From `docs/10-House-of-Parliament/` §7

```sql
alter table public.profiles add column is_platform_operator boolean not null default false;
alter table public.memory_entries add column justification text;
```

### 15.2 From `docs/16-Security/` §5, §7

```sql
alter table public.notification_channels add column config_secret_id uuid;
-- config_secret_id references a Supabase Vault secret (vault.secrets) holding
-- the sensitive portion of config (webhook URL, SMTP password); existing
-- `config` jsonb column retained for non-sensitive metadata only.

alter table public.organisation_members
  add constraint organisation_members_role_check
  check (role in ('owner', 'admin', 'member', 'viewer'));
-- existing default 'member' (§1) is already a valid value under this
-- constraint — no backfill needed.
```

### 15.3 From `docs/07-Grant-Studio/` §3.1, §6.1, §8.1, §9.1, §10.1

```sql
-- §3.1 Eligibility Engine
create table public.eligibility_reports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  opportunity_id uuid not null references public.opportunities(id),
  operational_capacity_status text check (operational_capacity_status in ('pass','warning','fail')),
  financial_capacity_status text check (financial_capacity_status in ('pass','warning','fail')),
  geographic_eligibility_status text check (geographic_eligibility_status in ('pass','warning','fail')),
  consortium_requirements_status text check (consortium_requirements_status in ('pass','warning','fail')),
  budget_ceiling_fit_status text check (budget_ceiling_fit_status in ('pass','warning','fail')),
  risk_flags text[] default '{}',
  recommendation text check (recommendation in ('go','no_go','needs_review')),
  created_at timestamptz not null default now()
);

-- §6.1 Logframe Studio — indicators was project_id-only; Logframe Studio
-- needs it pre-award against a proposal_id with no project_id yet
alter table public.indicators add column proposal_id uuid references public.proposals(id);
alter table public.indicators alter column project_id drop not null;  -- confirm against real current constraint before applying

-- §8.1 Compliance Studio — Compliance Override justification
alter table public.compliance_findings add column override_justification text;

-- §9.1 Reporting Studio — extend existing report_type CHECK, do not add a new table
alter table public.reports drop constraint if exists reports_report_type_check;
alter table public.reports add constraint reports_report_type_check
  check (report_type in ('monthly_report','me_brief','compliance_review','interim_narrative','final_narrative'));
-- Claude Code: confirm the real current constraint name/values before
-- dropping and recreating — this is illustrative of intent, not a verified
-- diff against the live schema.

-- §10.1 Submission Gateway
create table public.submission_packages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  proposal_id uuid not null references public.proposals(id),
  status text not null check (status in ('compiling','ready_for_review','submitted')) default 'compiling',
  compiled_documents jsonb not null default '[]',
  compliance_status_snapshot text check (compliance_status_snapshot in ('pass','warning_overridden')),
  submitted_by uuid references auth.users(id),
  submitted_at timestamptz
);
revoke update on public.submission_packages from authenticated;
```

**Staging-validation discipline (ADR-0007) applies in full to this section**
— every statement above must be run through a Supabase branch or the
cloned staging project (`docs/19-Deployment/`) before promotion, same as
every other migration in this document. The `reports_report_type_check`
statement in particular touches a real, live table and must not be applied
to production without first confirming the actual current constraint
against the live schema — a mismatch there is a live-table risk, not a
hypothetical one.

## 16. Follow-On Migrations from AI Governance (v1.5)

From `docs/17-AI-Governance/` §1.2, §2.1. Additive only, same discipline as
§15.

```sql
-- §1.2 Observability & Cost Service
alter table public.agent_runs add column source text not null default 'production'
  check (source in ('production','house_of_parliament'));
-- resolves House of Parliament spec §9's cost-attribution requirement.

create table public.cost_rollups (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  scope_type text not null check (scope_type in ('ministry','proposal','project','user')),
  scope_id uuid not null,
  period_start date not null,
  period_end date not null,
  total_token_cost numeric not null default 0,
  total_invocations integer not null default 0,
  confidence_distribution jsonb default '{}',
  computed_at timestamptz not null default now()
);
-- derived/cache table, recomputed periodically from agent_runs — never the
-- source of truth for an individual invocation's cost.

-- §2.1 AI App Register
create table public.ai_app_register (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id),
  application_or_ministry text not null,
  owner uuid references auth.users(id),
  purpose text not null,
  vendor_model text not null,
  data_sources text[] default '{}',
  risk_tier text not null check (risk_tier in ('minimal','limited','high_risk_equivalent')),
  oversight_matrix_ref text,
  monitoring_kpis text[] default '{}',
  review_cadence text not null default 'quarterly',
  last_reviewed_at date,
  created_at timestamptz not null default now()
);
```

Same staging-validation discipline as §15 applies — none of this touches an
existing column, but `agent_runs` is a real, live table and the new column
must be validated on a branch first.
