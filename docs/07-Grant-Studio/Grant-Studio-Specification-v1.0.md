---
document: Grant Studio (Pre-Award) Specification
version: 1.0
status: APPROVED — approved by Product Owner 12 July 2026, all modules (§2-§10); §13's field-level-detail caveat and five follow-on migrations (§12) remain tracked as non-blocking follow-ups, to be appended to docs/11-Database-Schema/ before implementation begins
parent: ../../00-EAS-v1.0.md (EAS §5, §10)
related_adrs: ../21-ADRs/0001-consortium-builder-dual-mandate.md, ../21-ADRs/0002-opportunity-intelligence-live-schema.md
---

# Grant Studio — Specification v1.0

## 1. Scope and Position in the Architecture

Grant Studio is a Layer 1 application (EAS §3.1). It has no logic of its own beyond
orchestrating calls to Layer 2 ministries (Fundraising, Research, Writing, M&E,
Finance & Administration, Compliance) and Layer 3 platform services (Regulatory
Knowledge Layer, Context Engine, Knowledge Platform, Compliance Engine). Every
compliance claim it surfaces must be a cited response from the Compliance API
(EAS §6.3) — Grant Studio never asserts eligibility or compliance status from a
raw LLM call.

It replaces the narrower "Concept Note Drafter" framing with the full pre-award
lifecycle:

```
Opportunity Discovery → Eligibility Assessment → Go/No-Go Decision →
Consortium Builder → Concept Note → Full Proposal → Logical Framework →
Budget → Compliance Review → Submission Package → Submission
```

Reporting Studio (interim/final narrative reporting) is included in this spec
even though it is technically a post-award activity, because it shares Grant
Studio's Continuous Compliance model and EU template dependency — see §9.

## 2. Module 1 — Opportunity Intelligence

**Ministry:** Fundraising. **Existing asset:** AI Grants Scraper (Claude artifact).
**Status:** confirmed — see ADR-0002.

This module's product requirements were originally scoped from the Civil Society
Funding Monitor (CSFM) PRD (v1.0, Meridian AI, 2026-05-31). That PRD is still the
correct source for infrastructure the scraper does not yet do itself (crawl
scheduling, source registry, dashboard information architecture, notification
dispatch — §2.3 below). But the scraper's **actual live output** —
`funding-dashboard-v5.html`, an 8 June 2026 scrape session covering 40 opportunities
across four thematic clusters — is more advanced than the CSFM schema in several
respects and is adopted as the canonical shape for the `Opportunity` entity's
extended fields. Do not re-derive the schema from the CSFM PRD alone; reconcile
against both, with the live schema taking precedence on conflict.

### 2.1 Live schema (confirmed from `funding-dashboard-v5.html`, 8 Jun 2026 scrape)

Each opportunity record in current production use carries:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Internal short code |
| `sec` | enum | Thematic cluster: `digital` (Digital Rights & AI), `gender` (Gender, LGBTIQ+ & SRHR), `defenders` (Defenders & Communities), `eu_inst` (EU Institutional) |
| `isNew` | boolean | Flagged new since the previous scrape version |
| `title` | string | |
| `fdr` | object | `{ name, prog, ds, rel }` — funder name, programme name, **donor status** (`ds`: Current Donor / Warm Prospect / Former Donor / Cold Prospect / New Funder / Revisit Prospect — matches the Donor pipeline vocabulary, EAS §4), and internal relevance rating |
| `desc` | string | Full extracted description |
| `tags` | string[] | Controlled-vocabulary theme tags |
| `tc` | object | Per-tag confidence score, 0–1 (`{tag: score}`) — finer-grained than CSFM's single `relevance_score` |
| `elig` | string | Eligibility summary |
| `region`, `ftype`, `atype` | string | Geography, funding type, application type |
| `min`, `max`, `cur` | number, string | Budget range and currency |
| `dl` | date or null | Deadline; `null` means rolling/forthcoming |
| `status` | enum | `open` / `closed` / `forthcoming` |
| `strat` | string | **Strategic action narrative** — a human-readable recommendation (e.g. "assign a proposal team immediately," "explore joining an existing consortium") generated per opportunity. Not present in the CSFM schema at all. |
| `risk` | number 0–1 | Risk score |
| `rel` | number 0–1 | Overall relevance score (CSFM's `relevance_score` equivalent) |
| `url` | string | Source URL |
| `scrapeNote` | string | Provenance: which sources confirmed the data and when |
| `version` | integer | Increments each time the record is re-confirmed/updated across scrape sessions — a lightweight analogue of CSFM's `crawl_log` |
| `flags` | array (optional) | `{ f: category, i: description, s: severity }` — e.g. a timeline flag noting an LOI window has passed |

### 2.2 Reconciliation and required extension

The `Opportunity`/`Call` entity (EAS §4) is extended to carry `strat` (strategic
narrative), `risk`, per-tag `tc` confidence, `flags[]`, and `version` as
first-class fields — these are genuinely useful outputs the platform should keep,
not artefacts of the prototype to discard. The Compliance/Eligibility Engine (§3)
should treat `strat` as a **draft recommendation for human review**, not an
autonomous verdict — it currently reads as authoritative prose (e.g. "act today")
and must be re-labelled as AI-generated guidance requiring Research Ministry
sign-off once this moves from a standalone artifact into the governed platform,
consistent with EAS §7.2 (human oversight is structural).

Thematic clusters (`digital`, `gender`, `defenders`, `eu_inst`) map to the Theme
controlled vocabulary the CSFM PRD defines in more granular form (§4.2 of that
PRD) — treat the four clusters as a display-level grouping over the finer CSFM
tag set, not a replacement for it.

### 2.3 Reconciliation against EAS §4 domain model

| CSFM PRD entity | EAS domain entity | Notes |
|---|---|---|
| `opportunity` | `Call / Opportunity` | Same concept; CSFM's `relevance_score`/`confidence` fields become properties surfaced through the Fundraising ministry's output, not raw platform fields |
| `donor` | `Donor` | Direct match |
| `source` | *(new — platform-level)* | Belongs to the Knowledge Platform's source registry (EAS §3.3), shared infrastructure, not Grant Studio-specific |
| `crawl_log` | *(new — platform-level)* | Same — Layer 3 concern |
| `saved_search`, `digest` | *(Grant Studio-specific)* | Stay in Grant Studio's application data, not the core domain model |

**Source taxonomy, scoring framework (35% theme / 25% eligibility / 20% urgency /
10% donor fit / 10% source reliability), crawl schedule, AI extraction pipeline,
and AI assistant prompt design**: adopt the CSFM PRD §3–§8 as-is, extended per
§2.1–§2.2 above. Do not re-specify from scratch.

**Deviation from the CSFM PRD required by this platform:**

- The CSFM PRD's own AI assistant (§8.1) must be re-platformed to route through
  the Context Engine and LLM Gateway (EAS Layer 3/4) rather than calling a model
  directly, and its "never fabricate" guardrail (§8.3) becomes a Compliance
  Engine check, not an unverified prompt instruction.
- Geographic and thematic scope in the CSFM PRD is tuned to digital
  rights/democracy funders. The confirmed live scrape (§2.1) shows this is
  already happening in practice — four clusters, one of them (`eu_inst`, EU
  Institutional) added between scrape versions — so the source taxonomy (§4.1
  categories A–F) should be extended by observing which new clusters/sources get
  added over time, not fixed once at spec time.
- `donor` records seed from the organisation's actual donor pipeline
  (`20250904_Donor-Pipeline_Integrated.xlsx`, Google Drive, confirmed source of
  truth). Real columns: `Donor_Name`, `Official_Website`, `Region`,
  `Funder_Type`, `Donor_Status`, `Priority` (e.g. "2025 Medium Term"),
  `Relevance`, `Comments`, `Areas_of_Interest`, `Last_Action`, `Next_Action`,
  `Assigned_To`, `DFF_Position`, `Last_updated`. `DFF_Position` is a **pipeline
  stage** distinct from `Donor_Status` — values observed: Identify, Research,
  Ask, Cultivate, Monitor, Waiting for reply, Close — and should be modelled as
  its own field on the Donor entity (EAS §4), not folded into `Donor_Status`.
  `Assigned_To` confirms donor relationships are managed by more than one
  person; the Donor entity needs a `relationship_owner` reference to a User
  (EAS §4), not an unowned record.

**Output to downstream modules:** an `Opportunity` record with status
`open`/`forthcoming`/`rolling`/`closed`/`archived` is the entry point for
Module 2 (Eligibility Assessment). Human Gate 1 (Strategic Decision) sits
between Opportunity Intelligence and Eligibility Assessment.

## 3. Module 2 — Eligibility Engine

**Ministry:** Research, calling the Regulatory Knowledge Layer's Eligibility API.

**Purpose:** replace manual reading of each call's Guidelines for Applicants with
a structured Go/No-Go input, before Writing or Finance & Admin are ever activated
(cost-control principle — EAS §2, principle 4).

**Inputs:** the selected `Opportunity`, the Organisation's capacity profile
(financial capacity, operational capacity, geographic eligibility, past grant
history), and — where relevant — a proposed `Partner` set from the Consortium
Builder (§4).

**Process:** the engine queries the Eligibility API against:

- The specific call's Guidelines for Applicants (highest authority per the
  Internal Knowledge Assistant's normative hierarchy — see EAS §6.4).
- PRAG 2025 general eligibility rules.
- The Standard Grant Contract's General/Special Conditions where a template
  contract is already attached to the call.

**Output — Eligibility Report:**

```json
{
  "call_id": "string",
  "operational_capacity": { "status": "pass|warning|fail", "findings": [ /* cited rule objects, EAS §6.3 shape */ ] },
  "financial_capacity": { "status": "pass|warning|fail", "findings": [] },
  "geographic_eligibility": { "status": "pass|warning|fail", "findings": [] },
  "consortium_requirements": { "status": "pass|warning|fail", "findings": [] },
  "budget_ceiling_fit": { "status": "pass|warning|fail", "findings": [] },
  "risk_flags": ["string"],
  "recommendation": "go|no_go|needs_review"
}
```

Every `findings[]` entry is a Compliance API response object (rule, source,
severity, status) — never freeform text asserting a rule exists.

**Gate:** Human Gate 2 (Go/No-Go) requires this report before it can be
approved; the platform blocks the gate server-side if Research has not run,
matching the existing MVP's enforcement of this rule (`humanGates.js`) — that
behaviour is retained, not weakened, in the target architecture.

### 3.1 Data contract and API surface

The per-category `findings[]` entries are `compliance_findings` rows
(`docs/11-Database-Schema/` §4, `artefact_type = 'opportunity'`) queried
through the Regulatory Knowledge Layer's Eligibility API (Regulatory
Knowledge Layer spec §6) — no new findings-storage mechanism. The
report-level envelope (the five category statuses plus `recommendation`)
has no existing home and needs one new table, a follow-on to
`docs/11-Database-Schema/` §5.2:

```sql
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
```

API: `POST /eligibility-reports` (Research Ministry triggers, populates the
five category statuses by querying the Eligibility API and writing matching
`compliance_findings` rows), `GET /eligibility-reports?opportunityId=`
(what Human Gate 2's UI reads to render the report and block/allow
approval).

## 4. Module 3 — Consortium Builder

**Ministry:** Research + Compliance (joint — modelled as a Committee, EAS §3.2)
for pre-award. **Post-award: a joint Partner Management Committee — Procurement +
Finance & Administration + Compliance + M&E**, resolved below (§4.3),
closing the open item this spec previously deferred to
`docs/08-Project-Operations/`.
**Status:** confirmed in scope for the first Grant Studio increment — dual
pre-award/post-award mandate. See ADR-0001.

**Status in the MVP/roadmap:** completely absent — this is new surface area,
not a re-platform of existing code.

Consortium Builder is the one module in this specification that is not
pre-award-only. It owns the `Partner` entity end-to-end across the full grant
lifecycle: pre-award compliance and mandatory documentation, and post-award
partnership management. It is built first inside Grant Studio; Project
Operations (`docs/08-Project-Operations/`) consumes the same `Partner` entity
and workflows rather than maintaining a separate partner record post-award.

### 4.1 Pre-award scope

- **Partner database:** legal entity records, PIC/PADOR identifiers where
  applicable, past cooperation history with this organisation.
- **Partner scoring:** capacity assessment against the specific call's
  consortium requirements (from the Eligibility Report, §3).
- **Role/mandate assignment:** lead applicant vs. co-applicant vs. associate,
  validated against the call's partnership rules.
- **Due-diligence check:** routed through the Compliance Engine's eligibility
  validator for each partner (exclusion/selection criteria — Annex H
  territory).
- **Mandatory administrative document management** — the concrete, recurring
  paperwork every partner must produce before a proposal can be submitted, each
  tracked to completion status rather than assumed present:
  - Legal Entity File (LEF) and Financial Identification Form (FIF)
  - Declaration of Honour on exclusion and selection criteria (Annex H)
  - Mandate letters for co-applicants (proof the lead applicant is authorised
    to act on the consortium's behalf)
  - Organisation statutes / proof of legal registration
  - Proof of co-financing where required by the call
  - CVs of key proposed staff, where the call requires them at application
    stage
  Each document type is a checklist item against the specific call's
  Guidelines for Applicants (queried via the Regulatory Knowledge Layer's
  Annex API, EAS §6.3) — not a fixed universal list, since requirements vary
  by donor and call.

### 4.2 Post-award scope

- **Subcontracting / sub-granting oversight:** tracking which partners hold
  subcontracts or sub-grants, their value, and compliance status against the
  Standard Grant Contract's procurement rules (Annex IV).
- **Partner-level financial reporting:** consolidating each partner's
  expenditure into the `Project`'s financial reports, feeding Reporting Studio
  (§9).
- **Partner payment / transfer tracking**, including any transfer-of-ownership
  documentation (Annex IX) where equipment or assets move between partners.
- **Amendment management:** when a partner's role, budget share, or mandate
  changes mid-project, requiring a contract amendment.
- **Periodic due-diligence refresh:** re-screening partners against exclusion
  criteria on a cadence (not one-time at proposal stage), since a partner's
  eligibility status can change during a multi-year project.
- **Performance rating:** structured feedback on each partner's delivery,
  written back to the `Partner` entity's institutional memory (Knowledge
  Platform, EAS §3.3) so future Consortium Builder scoring (§4.1) reflects
  actual cooperation history, not just self-reported past cooperation.

**Output:** a `Partner[]` set attached to the `Proposal` pre-award and to the
`Project` post-award (same underlying entities, EAS §4), each with a
due-diligence status and — post-award — a running compliance and performance
record. Pre-award output feeds the Proposal Builder (§5) and continuous
Compliance Studio checks (§8); post-award output feeds Reporting Studio (§9)
and `docs/08-Project-Operations/`.

### 4.3 Post-award ministry assignment (resolves §13's former open item)

`docs/08-Project-Operations/` §4 confirmed the *table* (`partners`,
Database Schema §5.2) but left the *ministry* assignment open. Splitting
§4.2's post-award functions across the existing v1 Ministry Library (EAS
§3.2) rather than inventing a new ministry:

| Function (§4.2) | Owning ministry | Rationale |
|---|---|---|
| Subcontracting/sub-granting oversight | Procurement | Matches Procurement's existing scope (thresholds, tendering, vendor selection) — a subcontract is a vendor relationship |
| Partner-level financial reporting | Finance & Administration | Consolidates into `Project` financial reports; feeds Reporting Studio (§9) as an input, does not own the report artefact itself |
| Payment/transfer tracking | Finance & Administration | Direct extension of its existing budget/actuals responsibility |
| Amendment management | Compliance | Contract amendments are compliance/legal territory (Standard Grant Contract General Conditions), jointly consulted with Finance & Administration when the amendment changes a budget share |
| Periodic due-diligence refresh | Compliance | Same exclusion-criteria machinery as pre-award due diligence (§4.1) — Compliance already owns this check, just re-run on a cadence |
| Performance rating | M&E | Structured delivery feedback is an M&E function by nature (indicators, evaluation), and its output should feed the same indicator/evaluation machinery Logframe Studio (§6) already uses, not a separate rating scheme |

Modelled as a joint **Partner Management Committee** (EAS §3.2's Committee
pattern — cross-ministry review body for a specific workflow), not a new
ministry, consistent with how pre-award Consortium Builder is already
modelled as a Research + Compliance Committee.

## 5. Module 4 — Proposal Builder

**Ministry:** Writing. **Existing asset:** EU Concept Note Drafter (Claude
artifact) — becomes v1 of this module's Concept Note stage, not the whole module.

**Stages:**

1. **Concept Note** (Annex A1) — where the call is two-stage.
2. **Full Application** (Annex A2) — Executive Summary, Organisation,
   Problem Analysis, Stakeholders, Theory of Change, Methodology,
   Implementation, Visibility, Risk, Sustainability, Added Value, Work Plan,
   Monitoring, Communication, and cross-cutting sections (gender, environment,
   human rights, innovation, digitalisation, EU added value).

**Architecture rule:** each donor section is its own drafting workflow (a
Workflow Instance, EAS §4), not one monolithic "draft the proposal" call. This
is what makes the Vote of No Confidence protocol (EAS §3.2) meaningful — a
section-level failure triggers a section-level rewrite, not a full-document
regeneration.

**Context assembly:** every section drafting workflow calls the Context Engine
(EAS §3.3) for: the relevant Annex template structure, the Logframe (§6) and
Budget (§7) once they exist (so narrative stays consistent with the technical
skeleton — this is the "M&E/Finance drift" failure mode named in the original
gap audit), past proposals from the Knowledge Platform, and the organisation
profile.

**Veto:** every section passes through the Tripartite Veto Engine (EAS §3.2)
before being marked draft-complete: deterministic (character limits, mandatory
field presence), lexical (donor keyword coverage — e.g. "gender mainstreaming"
must appear where the Guidelines require it), semantic (LLM-as-judge against a
donor-guideline-derived rubric).

### 5.1 Data contract and API surface

Backed by `docs/11-Database-Schema/` §5.2's `proposals` and
`proposal_sections` tables — no new schema. Each `proposal_sections` row's
`workflow_instance_id` links it to the Workflow Instance driving that
section's drafting/veto/rewrite cycle (Parliament Core spec §2), which is
the mechanism behind the "section-level failure triggers section-level
rewrite" architecture rule above.

API: `POST /proposals` (from an `Opportunity`, post Human Gate 2), `POST
/proposals/{id}/sections/{sectionKey}/draft` (invokes the section's
Workflow Instance), `GET /proposals/{id}/sections` (assembly view for the
Polish Gate), `POST /proposals/{id}/promote` (Concept Note → Full
Application stage transition). One Workflow Definition per donor section
type (e.g. "Concept-Note-Problem-Analysis-v1"), authored and versioned
through House of Parliament's Workflow Builder (`docs/10-`).

## 6. Module 5 — Logframe Studio

**Ministry:** M&E.

**Scope:** not merely "generate Annex C" — an editable intervention-logic
workspace: Theory of Change, intervention logic (objectives → results →
activities), indicators with baselines/targets/sources of verification, risks
and assumptions. Backed by an Indicator Library and Means-of-Verification
Library (reusable across proposals — Knowledge Platform content, EAS §3.3).

**Output:** the `Logframe` entity (EAS §4), which the Proposal Builder and
Budget Studio both read from — indicators and activities must be traceable
1:1 into budget line items and narrative claims, checked by the Compliance
Engine's semantic validator (cross-document consistency, not just per-document
correctness).

### 6.1 Data contract and API surface

Per `docs/11-Database-Schema/` §5.3: no generic `logframes` JSONB table —
the real `indicators` and `activities` tables (already extended with
`organisation_id`, §1) hold the normalised objective/result/indicator data;
`logframe_narratives` (proposal- or project-scoped) holds only the prose
that has no other home (Theory of Change statement, assumptions) plus the
`intervention_logic` objective/result tree, deliberately kept JSONB since
it is a tree, not a flat record set. The Indicator Library and
Means-of-Verification Library are Knowledge Platform content
(`docs/06-Knowledge-Platform/`), not a Grant-Studio-specific table — reused
across proposals by construction, not duplicated per proposal.

**Gap found while cross-referencing:** `indicators` (Database Schema §5.1)
is `project_id`-scoped only — correct for its post-award M&E origin, but
Logframe Studio writes indicators pre-award, against a `proposal_id` with
no `project_id` yet. This is the same shape of problem `budgets` (§5.2)
already solved with two nullable FK columns; `indicators` needs the same
fix, a follow-on to `docs/11-Database-Schema/` §5.1:

```sql
alter table public.indicators add column proposal_id uuid references public.proposals(id);
alter table public.indicators alter column project_id drop not null;  -- if currently not-null; confirm against real schema before applying
```

On award, a proposal's indicator rows are re-pointed (`proposal_id` stays,
`project_id` populated) rather than duplicated — the same "graduates into a
real row" pattern already used for `proposals` → `projects` (§5.1).

API: `POST /logframes/{proposalId}/narrative`, `POST
/logframes/{proposalId}/indicators` (writes to the real `indicators` table,
`proposal_id`-scoped pre-award), `GET /logframes/{proposalId}` (assembled
view: narrative + indicators + activities, what Budget Studio and Proposal
Builder's Context Engine calls both read).

## 7. Module 6 — Budget Studio

**Ministry:** Finance & Administration.

**Scope:** far larger than "fill in Annex B": Budget Builder against a Unit Cost
Library, staff cost calculator, equipment library, procurement planner, cash
flow projection, exchange rate handling, indirect cost calculator (bound to the
PRAG indirect-cost ceiling — e.g. the 7% example already cited in EAS §6.3),
co-financing tracking, scenario analysis, and mathematical-consistency
validation (deterministic — zero-hallucination tier of the Veto Engine).

**Output:** the `Budget` entity, validated continuously (not only pre-submission)
against the Regulatory Knowledge Layer's Budget API.

### 7.1 Data contract and API surface

Backed by `docs/11-Database-Schema/` §5.2's `budgets` table — already
dual-scoped (`proposal_id` and `project_id`, both nullable) precisely so a
budget persists across the award transition without a data migration; `line_
items` is JSONB (a scenario/version-varying structure, not a fixed record
set), `indirect_cost_rate` is a first-class numeric column specifically so
the Mathematical Validator (§8) can check it against the Budget API's
ceiling response without parsing JSON.

API: `POST /budgets/{proposalId}` (create/update line items),
`GET /budgets/{proposalId}/validate` (calls the Regulatory Knowledge
Layer's Budget API per line item and indirect cost rate, returns
`compliance_findings`-shaped responses — Budget Studio holds no ceiling
values itself, per EAS §2 principle 3), `POST /budgets/{proposalId}/
scenarios` (Unit Cost Library / exchange-rate scenario analysis — writes a
new `budgets` row with the same `proposal_id`, not a mutation, so scenarios
can be compared side by side).

## 8. Module 7 — Compliance Studio

**Ministry:** Compliance (the "Opposition").

**Principle — continuous, not terminal:**

```
Proposal → Compliance → Proposal → Compliance → Proposal → Compliance
```

not the naive `Proposal → Compliance` single gate. Every module above (§2–§7)
calls Compliance Studio's validators as it produces output, not only at
submission time.

**Specialised validators** (each returns PASS/WARNING/FAIL with a cited rule —
EAS §6.3 response shape):

`Eligibility Validator`, `PRAG Validator`, `Budget Validator`, `Procurement
Validator`, `Reporting Validator`, `Visibility Validator`, `Gender Validator`,
`Human Rights Validator`, `Procurement Threshold Validator`, `Procurement
Documentation Validator`, `State Aid Validator`, `Annex Validator`, `Character
Count Validator`, `Mathematical Validator`, `Semantic Validator`.

Each validator is a thin client of the Regulatory Knowledge Layer's Compliance
API (EAS §6.3) — Compliance Studio itself holds no rule text, matching the
platform-wide principle (EAS §2, principle 3).

**Human Gate interaction:** Compliance Studio's status feeds the Polish Gate
(Human Gate 3) directly — a proposal cannot reach Polish with any `FAIL` status
outstanding; `WARNING` statuses require the Compliance Override control (EAS
§3.1) with a logged justification, never silent suppression.

### 8.1 Data contract and API surface

No new storage — every validator writes `compliance_findings` rows
(Database Schema §4, `artefact_type` in `'proposal'|'budget'|'logframe'|
'partner'`, matching the Regulatory Knowledge Layer's `ComplianceFinding`
shape, §5 of that spec) through the Compliance API. Compliance Studio is
purely an orchestration layer that calls the right specialised endpoint
(§6.3 of the EAS, restated in Regulatory Knowledge Layer spec §6) per
artefact type and aggregates the results for the Polish Gate view — it has
no table of its own to add.

API: `GET /compliance/status?proposalId=` (aggregated PASS/WARNING/FAIL
across all artefact types for a proposal — what the Polish Gate reads),
`POST /compliance/override` (Compliance Override control, requires
`owner`/`admin` role per `docs/16-Security/` §2.2, writes a
`compliance_findings`-linked justification record — same table, an
`override_justification` column is a follow-on to Database Schema §4 rather
than a new table).

## 9. Module 8 — Reporting Studio

**Ministry:** Reporting (post-award), reusing Writing's drafting infrastructure.

**Renamed from "Progress Drafter"** because its scope is broader: Interim
Narrative Report, Final Narrative Report, Results Reports, Success Stories,
Case Studies, Lessons Learned, Monitoring Reports, Management Reports, Board
Reports, Donor Reports.

**Inputs:** the post-award `Project` entity's monitoring database, indicators
(from the original Logframe), activities, budget (actuals vs. planned),
photos/evidence, deliverables, procurement records, attendance lists.

**Mandatory templates:** Annex G Model Interim Narrative Report, Annex G Model
Final Narrative Report — both already ingested as Regulatory Knowledge Layer
source documents (EAS §6.1) — plus donor-specific templates as attached to each
`Project`'s originating contract.

**Compliance:** same Continuous Compliance model as pre-award (§8) — every
report draft is checked against the Reporting Validator before reaching a
human gate, and the "lessons learned" output feeds back into the Knowledge
Platform, closing the learning loop described in the architecture discussion
that led to this EAS (Opportunity → Proposal → Submission → Project →
Monitoring → Reporting → Lessons Learned → Knowledge Platform → future
Proposal).

### 9.1 Data contract and API surface

Backed by the real, live `reports` table (Database Schema §5.1), extended
to accept `report_type` values `'interim_narrative'` and `'final_narrative'`
alongside the existing `'monthly_report'|'me_brief'|'compliance_review'` —
Reporting Studio is additive to the existing `reporting-agent` edge
function's table, not a parallel one (Project Operations spec §3). Lessons
Learned output is written as a `knowledge_documents` row (Knowledge
Platform spec), `document_type = 'lessons_learned'`, `project_id`-linked —
closing the loop concretely, not just narratively.

API: `POST /reports/{projectId}` (`report_type` required), `GET /reports/
{projectId}/validate` (Reporting Validator, same `compliance_findings`
mechanism as §8), `POST /reports/{id}/lessons-learned` (writes the
Knowledge Platform document).

## 10. Module 9 — Submission Gateway

**Scope:** compiles the approved Proposal, Logframe, Budget, and all mandatory
annexes (Declaration of Honour, financial guarantee model, transfer-of-
ownership template, tax-regime information, SEA-H self-evaluation questionnaire
— all already available as Regulatory Knowledge Layer source documents) into a
donor-ready submission package.

**Hard constraint (EAS §9, Liability NFR):** no automated submission to any
donor portal. The Submission Gateway prepares the package; Human Gate 4
(Submission) is the only mechanism that marks a proposal as submitted, and that
action is always a named, logged, human act.

### 10.1 Data contract and API surface

No existing table covers a compiled, versioned submission package. New
table, a follow-on to Database Schema §5.2:

```sql
create table public.submission_packages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  proposal_id uuid not null references public.proposals(id),
  status text not null check (status in ('compiling','ready_for_review','submitted')) default 'compiling',
  compiled_documents jsonb not null default '[]',  -- ordered list: {documentType, sourceTable, sourceId, annexTemplateId}
  compliance_status_snapshot text check (compliance_status_snapshot in ('pass','warning_overridden')),
  submitted_by uuid references auth.users(id),
  submitted_at timestamptz
);
revoke update on public.submission_packages from authenticated;  -- status transitions only via the API below, not direct row edits
```

API: `POST /submission-packages/{proposalId}/compile` (assembles Proposal
sections, Logframe, Budget, and mandatory annexes into `compiled_documents`
— blocked server-side unless Compliance Studio's aggregated status, §8.1,
is `pass` or an explicitly overridden `warning`), `POST /submission-
packages/{id}/submit` (Human Gate 4 only — the sole path that sets `status
= 'submitted'`, `submitted_by`, `submitted_at`; no other endpoint or agent
can reach this state, enforcing the Liability NFR at the API layer, not
just by convention).

## 11. Data Contracts Summary

Full JSON Schema definitions are deferred to `docs/12-APIs/`; the object shapes
referenced above (Eligibility Report, Compliance finding, Logframe, Budget) are
binding in shape even before that formal schema is written — Claude Code should
treat the field names and nesting shown in §3 and §8 as normative, not
illustrative.

## 12. Resolved Items

- **Consortium Builder scope** — confirmed in scope for the first increment,
  with the dual pre-award/post-award mandate described in §4. See ADR-0001.
- **Consortium Builder post-award ministry assignment** — a joint Partner
  Management Committee (Procurement, Finance & Administration, Compliance,
  M&E, each owning a named sub-function), §4.3.
- **Donor pipeline seed source** — confirmed as `20250904_Donor-Pipeline_
  Integrated.xlsx` (Google Drive), with real column list captured in §2.3's
  deviation notes.
- **Opportunity Intelligence schema** — confirmed against the live scraper
  output (`funding-dashboard-v5.html`, 8 June 2026 scrape), reconciled in §2.1–
  §2.2. See ADR-0002.
- **Data contracts and API surfaces for §3, §5–§10** — each module now cites
  its backing table (existing, per `docs/11-Database-Schema/` v1.3, or a
  labelled new/follow-on migration where no existing table fit) and an API
  surface, rather than narrative description only. One real gap surfaced and
  fixed while doing this: `indicators` was `project_id`-only, but Logframe
  Studio needs it pre-award against a `proposal_id` — §6.1 adds the missing
  nullable FK, mirroring the pattern `budgets` already used.

## 13. Open Items for This Spec

- **Five new/follow-on tables introduced in this pass** —
  `eligibility_reports` (§3.1), `indicators.proposal_id` (§6.1),
  `compliance_findings.override_justification` (§8.1), `reports.report_type`
  CHECK extension (§9.1), `submission_packages` (§10.1) — are proposed here
  as the business contract; none exist in `docs/11-Database-Schema/` yet.
  Per this project's established pattern (Platform Services §2.1, House of
  Parliament §7), they should be appended to Database Schema as labelled
  follow-on migrations once this spec is approved, not written twice.
- Field-level detail in §3, §5–§10 has still not been walked through with
  the Product Owner in the same depth as §2 and §4 — the API surfaces and
  DDL cross-references close the *structural* gap (nothing here contradicts
  or duplicates an existing table), but business-rule correctness (e.g. the
  exact `submission_packages.compiled_documents` document list, or whether
  `eligibility_reports`' five fixed categories are the right and complete
  set for every donor) is provisional until reviewed.
- Submission Gateway's exact annex-template-to-document mapping (§10.1's
  `compiled_documents` entries) is left at the shape level; the concrete
  per-donor annex list is an `docs/12-APIs/`/implementation-time detail once
  a specific call's Guidelines for Applicants is queried through the Annex
  API, not something this architecture spec should hardcode.
