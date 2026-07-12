---
document: AI Governance Specification — AI App Register, Observability & Cost Service, EU AI Act Posture
version: 1.0
status: DRAFT — pending Product Owner approval
parent: ../../00-EAS-v1.0.md (EAS §7 Governance & AI-Risk Model, §3.3 Observability & Cost Service)
related_specs: ../16-Security/Security-Specification-v1.0.md, ../03-Parliament-Core/Parliament-Core-Specification-v1.0.md, ../04-Platform-Services/Platform-Services-Specification-v1.0.md
---

# AI Governance — Specification v1.0

## 0. Scope and Boundary

Two things live here, both named by EAS but not yet detailed: the AI-risk
governance apparatus (EAS §7 — AI App Register, DPIA template, oversight
matrix, transparency matrix, incident response) and the **Observability &
Cost Service**, a Layer 3 service EAS §3.3's table assigns to this spec
specifically (not Platform Services, which explicitly scoped it out —
Platform Services §0: "this spec produces the raw data... it does not build
the dashboards"). Baseline for the AI-risk half: the ProposalAI Pro
Governance Blueprint (EAS §8 asset map) — adapted, not rewritten from zero.

## 1. Observability & Cost Service

### 1.1 Purpose

Aggregates the raw data every other Layer 3 service already emits — Agent
Invocation records (`agent_runs`, Parliament Core §3.6), Workflow Instance
state transitions (Platform Services' Event Bus), and Parliament Core's
confidence heuristic (§2.3.2 of that spec) — into per-ministry,
per-proposal, and per-user cost and confidence dashboards (EAS §9's
cost-control NFR). This service computes and stores aggregates; it does
not change how any upstream service already logs data.

### 1.2 Data Contract

```sql
-- Follow-on to Database Schema §3 (ai_agents/prompt_modules/agent_runs)
alter table public.agent_runs add column source text not null default 'production'
  check (source in ('production','house_of_parliament'));
-- resolves House of Parliament spec §9's cost-attribution requirement:
-- Playground/Replay/Benchmarking runs tag 'house_of_parliament' so they're
-- excluded from per-proposal/per-ministry production cost rollups.

create table public.cost_rollups (   -- materialized aggregate, recomputed on a schedule, not real-time-authoritative
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  scope_type text not null check (scope_type in ('ministry','proposal','project','user')),
  scope_id uuid not null,
  period_start date not null,
  period_end date not null,
  total_token_cost numeric not null default 0,
  total_invocations integer not null default 0,
  confidence_distribution jsonb default '{}',  -- {"high": n, "medium": n, "low": n} per Parliament Core §2.3.2
  computed_at timestamptz not null default now()
);
```

`cost_rollups` is a derived/cache table, recomputed periodically (via
`pg_cron`, consistent with `docs/15-Infrastructure/`'s lean toward
Supabase built-in primitives) from `agent_runs` — it is never the source of
truth for an individual invocation's cost, only the aggregate view.

### 1.3 API Surface

`GET /observability/cost?scopeType=&scopeId=&periodStart=&periodEnd=` — the
data source House of Parliament's Token Usage / Cost module (`docs/10-`
§1.10) and the Executive Dashboard (`docs/13-` §5) both consume. No write
endpoint beyond the internal recompute job — this service does not accept
externally-supplied cost figures.

## 2. AI App Register

### 2.1 Schema

Per EAS §7.4:

```sql
create table public.ai_app_register (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id),  -- null for platform-global entries (e.g. Regulatory Knowledge Layer itself)
  application_or_ministry text not null,   -- e.g. 'Writing Ministry', 'Grant Studio Proposal Builder'
  owner uuid references auth.users(id),
  purpose text not null,
  vendor_model text not null,              -- e.g. 'LLM Gateway — multi-provider (Gemini/Claude/GPT per Agent Version binding)'
  data_sources text[] default '{}',
  risk_tier text not null check (risk_tier in ('minimal','limited','high_risk_equivalent')),
  oversight_matrix_ref text,               -- points to §3 row(s) below
  monitoring_kpis text[] default '{}',
  review_cadence text not null default 'quarterly',
  last_reviewed_at date,
  created_at timestamptz not null default now()
);
```

### 2.2 Initial Entries (Template-Level, per EAS §7.4's Named List)

| Application/Ministry | Risk tier | Oversight matrix reference |
|---|---|---|
| Grant Studio — Proposal Builder | `high_risk_equivalent` (reaches donors) | §3, Polish/Submission Gate rows |
| Writing Ministry | `high_risk_equivalent` | §3, Polish Gate row |
| M&E — narrative generation | `high_risk_equivalent` | §3, Reporting row |
| Reporting Studio | `high_risk_equivalent` | §3, Reporting row |
| Fundraising — media/opportunity monitoring (Opportunity Intelligence) | `limited` (internal use, not donor/board-facing until a Proposal is built from it) | §3, Strategic Decision Gate row |

Each row's `vendor_model`, `data_sources`, and `monitoring_kpis` are
populated at registration time per actual Agent Version bindings — this
table states the required entries and their risk tier, not fabricated
vendor/KPI detail not yet decided.

## 3. Human Oversight Matrix

Per decision point (EAS §7.2's "named human approver" requirement, made
concrete):

| Decision point | Human role required (Security spec §2.2) | Logged as |
|---|---|---|
| Strategic Decision Gate | `owner`/`admin` | Gate Request decision (Parliament Core §2.4) |
| Go/No-Go Gate | `owner`/`admin` | Gate Request decision |
| Polish Gate | `owner`/`admin` | Gate Request decision |
| Submission Gate | `owner`/`admin` | Gate Request decision + `submission_packages.submitted_by` (Grant Studio §10.1) |
| Compliance Override | `owner`/`admin` | `compliance_findings.override_justification` (Security spec §5) |
| Prompt Version promotion | `is_platform_operator` | House of Parliament §4 |
| Institutional memory curation | `is_platform_operator` | House of Parliament §3 |

## 4. Transparency Matrix

Per stakeholder group — what each is told is AI-assisted, and how:

| Stakeholder | What they're told | Mechanism |
|---|---|---|
| Donor | Proposal narrative was AI-drafted and human-reviewed (standard disclosure practice, not per-sentence attribution) | Cover-note language, a Product Vision / brand decision on exact wording, not specified here |
| Board | Same, plus access to the AI App Register on request | Register is queryable, not proactively pushed |
| Beneficiary | No individual disclosure obligation at v1 (beneficiaries are not platform users; PII protection, `docs/16-` §4, is the operative safeguard, not disclosure) | N/A |
| Internal staff | Full visibility — every AI-generated artefact shows its confidence/flag state inline (Frontend spec §7) | UI-level, not a separate disclosure step |

## 5. DPIA Template

A structured template (not a filled instance — a specific DPIA is
completed per new high-risk AI use, using this shape):

```
1. Description of processing (what data, what AI system, what purpose)
2. Necessity and proportionality assessment
3. Risk identification (to data subjects — beneficiaries, donors, staff)
4. Mitigations in place (PII filter §16-Security §4; RLS/multi-tenancy;
   human oversight per §3 above)
5. Residual risk and sign-off (owner/admin, logged)
6. Review date
```

Filed against the relevant `ai_app_register` entry (`§2.1`), not a separate
untracked document.

## 6. Incident Response Playbook

AI-specific incident categories and first response, distinct from general
security incidents (`docs/16-Security/` owns those):

| Incident type | First response |
|---|---|
| Hallucinated compliance claim reaches a human gate uncaught | Log as an `ai_app_register`-linked incident; audit which Compliance Engine validator should have caught it (Grant Studio §8); does not block the gate retroactively — the human decision already made stands, this is a detection-gap fix, not an undo |
| Veto Engine failed to catch a genuine violation (post-submission discovery) | Escalate to `owner`/`admin` immediately (this is the scenario EAS §9's Liability NFR exists to make rare, not impossible); review whether the failure was deterministic/lexical (a fixable rule gap) or semantic (a judge-model miss) |
| PII leak through the pre-prompt filter (`docs/16-` §4) | Treat as a Security incident first (that spec's process), AI Governance logs it against the relevant `ai_app_register` entry for the risk-tier review |
| Prompt Version regression (a promoted version performs worse than the one it replaced) | House of Parliament's rollback mechanism (Platform Services §2.2) is the fix; this playbook's role is ensuring the regression was actually caught by Benchmarking (`docs/10-` §1.12) before wider impact, and flagging if it wasn't |

## 7. EU AI Act Deployer Obligations — Concrete Logging Mapping

Restates EAS §7.1's posture (deployer, not provider) and maps it to what
already gets logged, so this isn't aspirational:

| Obligation (Article 26 spirit) | Satisfied by |
|---|---|
| Human oversight | §3 above — every Gate decision is a logged, named human act |
| Monitoring | Observability & Cost Service (§1) + `compliance_findings` (Database Schema §4) |
| Record-keeping | `agent_runs`/Audit Event append-only trail (EAS §9), 5-year retention |
| Cooperation-readiness | The AI App Register (§2) is the artefact produced on regulator request — it already exists as a queryable table, not a document to assemble under time pressure |

## 8. Non-Functional Requirements

| Concern | Requirement |
|---|---|
| **Register completeness precedes new AI-assisted functions shipping** | A new ministry or module reaching `high_risk_equivalent` classification gets an `ai_app_register` entry before it goes live, not retroactively — same "spec before code" discipline (EAS principle 7) applied to governance registration. |
| **Cost rollup staleness is acceptable, cost data loss is not** | `cost_rollups` (§1.2) being a few hours stale (scheduled recompute) is fine; the underlying `agent_runs.tokenCost` it derives from must never be lost, since it's the audit-relevant figure. |

## 9. Open Items for Product Owner

- **Exact `review_cadence`** per AI App Register entry (§2.1 default
  `quarterly`) — a governance-process decision, not architecture.
- **Donor-facing disclosure wording** (§4) — a brand/Product-Vision
  decision, not specified here.
- **`cost_rollups` recompute frequency** — depends on `docs/15-`'s
  pg_cron-vs-Redis resolution.
