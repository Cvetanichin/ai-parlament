---
document: Enterprise Architecture Specification (EAS)
system: Parliamentary AI Ecosystem — an AI Operating System for Civil Society Organisations
version: 1.0
status: APPROVED — approved by Product Owner 12 July 2026
owner: Vas (Product Owner) — Civil Society Senior Consultant
architect: Claude (Chief Systems Architect, Claude Cowork)
implementer: Claude Code (Lead Developer) — implements approved specifications only
supersedes: Parliamentary_AI_Engine_Roadmap.md (roadmap-level document; retained as historical Phase 0-1 reference, no longer authoritative on architecture)
related_repo: https://github.com/Cvetanichin/parliamentary-ai-gov
---

# Parliamentary AI Ecosystem — Enterprise Architecture Specification

## 0. Purpose and Authority

This document is the single authoritative architecture reference for the Parliamentary AI Ecosystem. It replaces ad hoc roadmap planning as the source of truth for structure, boundaries, and responsibilities.

From the moment this document is approved:

- **Claude Code (or any coding agent) implements only what is specified here or in a linked detail specification under `docs/`.** It does not invent services, data models, endpoints, or ministry behaviour. If a specification is ambiguous or silent on a needed decision, the correct action is to ask, not to assume.
- **Claude (Cowork), acting as Chief Systems Architect, is the only role that changes architecture.** Changes are proposed as Architecture Decision Records (ADRs, `docs/21-ADRs/`), reviewed against this document, and — once approved by the Product Owner — merged into the EAS or a detail spec.
- **The Product Owner (Vas) is the sole approval authority.** Nothing here is binding until approved; nothing changes without Product Owner sign-off.

This is document `00`. Everything else in `docs/` is a detail specification that must be traceable to a section of this document. A detail spec that contradicts this document is wrong and must be corrected, not the other way around.

## 1. What This Platform Is

The product is not a proposal-writing tool and not "an AI Parliament." It is an **AI Operating System for Civil Society Organisations (CSOs)**, purpose-built around the EU/UNDP-style grant lifecycle, in which:

- The **Parliament** (Prime Minister, Ministries, Tripartite Veto Engine, Vote of No Confidence) is the governance and orchestration engine — one layer among four, not the whole system.
- Applications (Grant Studio, Project Operations, Knowledge Hub, House of Parliament) are what the human actually uses. They are built *on* the platform, not bundled *into* it.
- Regulatory compliance (PRAG, the Standard Grant Contract, donor Guidelines for Applicants, EU AI Act deployer obligations, organisational policy) is a **queried platform service**, not text pasted into prompts.

This distinction is the central architectural decision of v1.0 and the reason a four-layer model replaces the "ministries do everything" MVP shape.

## 2. Guiding Principles

These principles are binding on every future detail spec and every implementation decision.

1. **Platform over application.** A capability needed by more than one ministry or application belongs in Layer 3 (Platform Services), not duplicated inside a ministry.
2. **Services, not ministries, hold logic.** Ministries in Layer 2 orchestrate and decide; they do not embed retrieval, compliance rule text, prompt templates, or long-term memory. Those live in Layer 3 and are called through APIs.
3. **Regulatory knowledge is queried, never pasted.** No ministry or prompt embeds PRAG text, donor guideline text, or organisational policy directly. Every compliance claim traces to a clause in the Regulatory Knowledge Layer (§6).
4. **Human-in-the-loop is structural, not optional.** The four human gates (Strategic, Go/No-Go, Polish, Submission) are enforced at the platform level. No workflow can bypass them, and there is no fully autonomous submission path — ever (see §9.2, liability).
5. **Vendor neutrality.** No ministry or service calls an LLM provider directly. Everything routes through the LLM Gateway (Layer 4), so models can be swapped, mixed, or downgraded for cost without touching agent code.
6. **Existing assets are integrated, not rebuilt.** The Internal Knowledge Assistant, AI Grants Scraper, Intelligence Workspace, and the current MVP scaffold are reusable components with a defined migration path (§8). Rewriting them from scratch is an architecture failure, not a fresh start.
7. **Spec before code.** No detail spec, no implementation. A component without an approved spec does not get built, regardless of how straightforward it looks.
8. **Auditable by construction.** Every agent decision, veto verdict, LLM call, and human approval is logged to an append-only trail. This is not a Phase 5 feature; it is a Layer 3 service required from the first real ministry onward.

## 3. The Four-Layer Architecture

```
                        Human Executive Layer
                     (Human-in-the-Loop Decisions)
                                  │
                                  ▼
                    Parliamentary Governance Layer
                 (Prime Minister + Ministries + Voting)
                                  │
                                  ▼
                 Parliamentary Core Platform Services
      (Workflow • Memory • Knowledge • Compliance • AI Runtime)
                                  │
                                  ▼
                    Infrastructure & Intelligence Layer
     (Storage • APIs • LLMs • Search • Security • Monitoring)
```

Layers depend only downward. Layer 2 never talks to Layer 4 directly — it goes through Layer 3. Layer 1 never talks to Layer 3 directly except through defined application APIs. This is what keeps ministries thin and platform services swappable.

### 3.1 Layer 1 — Human Executive Layer

**Responsibility:** where the consultant (or, later, other CSO users) works, decides, and is legally accountable.

Contains:

- **Applications** — the user-facing products, each a thin client over Layer 2/3 APIs:
  - Grant Studio (Pre-Award) — see `docs/07-Grant-Studio/` (fully specified, §10 below).
  - Project Operations (Post-Award) — implementation, monitoring, reporting, procurement, evaluation, lessons learned. Integration target for the existing Intelligence Workspace SaaS (`cvetanichin.org`) — see §8.
  - Knowledge Hub — internal knowledge, research, meeting notes, institutional memory. A consumer of the Knowledge Platform (Layer 3), not a separate knowledge store. Named "Knowledge Hub" (not "Intelligence Workspace") per ADR-0008 — that name is reserved exclusively for the existing SaaS asset re-platformed into Project Operations above, to avoid two different applications sharing a name. See `docs/09-Knowledge-Hub/`.
  - House of Parliament — the **developer/integration workspace**, not customer-facing. Prompt IDE, agent registry, workflow builder, veto debugger, replay/benchmarking, live logs, confidence scores, token/cost view. This is where new agents, prompts, workflows, and compliance rules are tested before promotion to production. See `docs/10-House-of-Parliament/`.
  - Executive Dashboard — cross-application view: pipeline status, deadlines, cost, compliance posture.
- **Human Gates** — the four points where autonomous execution stops and a named human decision is structurally required:
  1. **Strategic Decision Gate** — pursue this opportunity cluster at all?
  2. **Go/No-Go Gate** — proceed past Research's feasibility verdict?
  3. **Polish Gate** — human review after the Veto Engine passes (or after Vote of No Confidence escalation), before submission-ready.
  4. **Submission Gate** — final sign-off before the donor portal. No workflow reaches a donor without this.
  A fifth, narrower control — **Compliance Override** — lets an authorised human accept a flagged risk with a logged justification; it never silently suppresses a flag.

**Explicitly does not contain:** ministry logic, prompt text, or regulatory rule text. Applications call Layer 2/3 APIs and render results; they do not reimplement compliance or drafting logic client-side.

### 3.2 Layer 2 — Parliamentary Governance Layer

**Responsibility:** orchestrate work and enforce governance. This is the ecosystem's distinctive IP.

Contains:

- **Prime Minister** — master orchestrator: task allocation, confidence monitoring, handoff between ministries, escalation to human gates. Existing asset: `backend/agents/pmAgent.js` (MVP) — to be re-platformed onto the Layer 3 Workflow Engine rather than containing its own control flow.
- **Cabinet / Ministry Library** — the ministries that do the work. **v1 core ministries** (per Product Owner scope decision — career/HR/labour-market tooling excluded from v1, see §8.4):
  - Fundraising (Opportunity Intelligence — see Grant Studio §10.1)
  - Research (feasibility, Go/No-Go Risk Matrix, eligibility cross-check)
  - Writing (narrative drafting, Rights-Based Approach)
  - M&E (Logframe, indicators, theory of change)
  - Finance & Administration (budgeting, eligibility of costs, procurement)
  - Compliance (the "Opposition" — owns the Tripartite Veto Engine, does not itself hold rule text; it *calls* the Regulatory Knowledge Layer)
  - Reporting (interim/final narrative and financial reports, post-award)
  - Procurement (thresholds, tendering, vendor selection, post-award)
  - Development (organisational policy, capacity building, training — continuous)
  Every ministry implements the same **Ministry Adapter** contract already established in the MVP (`backend/agents/ministryAdapter.js`): prompt builder, deterministic mock fallback, response parser. This pattern is retained and formalised, not replaced.
- **Committees / Observers** — cross-ministry review bodies for specific workflows (e.g. a Consortium Review Committee spanning Research + Compliance + Finance). Modelled as workflow participants, not separate services.
- **Opposition & Voting** — the accountability mechanism:
  - **Tripartite Veto Engine** — deterministic (rules/math, zero-hallucination), lexical (donor keyword/embedding match), semantic (LLM-as-judge against a rubric, ideally a different model/persona than the drafting agent). Existing asset: `backend/agents/vetoEngine.js` — becomes the Layer 2 client of the Layer 3 Compliance Engine; rule content moves out of the engine and into the Regulatory Knowledge Layer.
  - **Vote of No Confidence protocol** — triggered on repeated veto failure (two consecutive, configurable): forced context reset → structured error-log injection → automated rewrite → escalate to the Polish Gate if the rewrite still fails. Never loops indefinitely.
- **Delegation & Escalation** — rules for which ministry can act without a human, which must pause at a gate, and how failures propagate upward. Formalised as part of the Workflow Engine's workflow definitions (Layer 3), not hardcoded per ministry.
- **Audit** — every PM decision, ministry handoff, veto verdict, and vote outcome is written to the Layer 3 audit trail with the specific prompt version and model used.

**Explicitly does not contain:** document parsing, embeddings, retrieval, regulatory rule text, or persistent memory beyond the current task. Ministries call Layer 3 services for all of that.

### 3.3 Layer 3 — Parliamentary Core Platform Services

**Responsibility:** the shared "civil service" underneath the Parliament — where almost everything should actually live, per the gap audit. This is the layer the current MVP is thinnest on, and the layer that determines whether the platform scales past two ministries.

| Service | Purpose | Current state | Detail spec |
|---|---|---|---|
| **Workflow Engine** | Task routing, queues, retries, scheduling, dependencies, parallel execution. Replaces ad hoc control flow in `pmAgent.js`. | Not built — MVP uses direct function calls | `docs/03-Parliament-Core/` |
| **Agent Runtime** | Agent lifecycle, execution sandboxing, tool access, identity/permissions, versioning. Generalises the Ministry Adapter pattern into a runtime rather than a convention. | Partial — Ministry Adapter exists as a code convention only | `docs/03-Parliament-Core/` |
| **Context Engine** | Builds the prompt: retrieves relevant documents, past proposals, organisation/donor/partner profiles, and assembles/compresses them into the drafting context. | Not built — MVP sends prompts straight to the LLM Gateway | `docs/04-Platform-Services/` |
| **Prompt Registry** | Versioned system prompts and templates, per ministry, with author, approval state, rollback, and evaluation history. Prompts are treated as software artefacts, not code constants. | Not built — prompts live inline in ministry `.js` files | `docs/04-Platform-Services/` |
| **Memory Engine** | Long-term (institutional), working (session), project, proposal, and organisation memory. | Not built — MVP state is in-memory and resets on restart | `docs/04-Platform-Services/` |
| **Knowledge Platform** | Document ingestion (Drive, Notion, OCR), embeddings, semantic search, RAG, knowledge graph over institutional documents, templates, and policies. | **Corrected (Knowledge Platform spec §1):** the Internal Knowledge Assistant's actual documents are entirely regulatory and are assigned to the Regulatory Knowledge Layer below instead — this service has its own, separate seed source: a dedicated Google Drive folder ("Knowledge Platform Seed Corpus"), created and structured by `document_type`, confirmed as the v1 ingestion source. | `docs/06-Knowledge-Platform/` |
| **Regulatory Knowledge Layer** | Canonical, versioned, queryable source of donor and legal rules — see §6, first-class and detailed separately. | Seed content exists (PRAG 2025, Standard Grant Contract annexes, Guidelines for Applicants — already ingested as project documents); no extraction/API layer | `docs/05-Regulatory-Knowledge-Layer/` |
| **Compliance Engine / APIs** | Specialised validators (eligibility, PRAG, budget, procurement, reporting, visibility, gender, human rights, annex, character-count, mathematical, semantic) each returning PASS/WARNING/FAIL with a cited rule. Called by every ministry, not only pre-submission. | Partial — `vetoEngine.js` implements the three-tier veto concept but with inline rule logic, not a rule-cited API | `docs/05-Regulatory-Knowledge-Layer/` |
| **Event Bus** | Every ministry action emits an event; downstream services (dashboard, audit, notifications, other ministries) subscribe instead of being called directly. | Not built — MVP calls functions directly | `docs/04-Platform-Services/` |
| **Notification Engine** | Email/Slack/Teams/push dispatch for deadlines, digests, gate approvals, veto failures. | Not built | `docs/04-Platform-Services/` |
| **Observability & Cost Service** | Structured logging of every agent decision, LLM call, token cost, and veto verdict; per-ministry and per-proposal cost dashboards; confidence/accuracy/hallucination tracking. | Partial — append-only audit log exists in `store.js`; no cost or confidence tracking | `docs/17-AI-Governance/` |

Layer 3 is where the "ministries doing everything simultaneously" problem gets solved: ministries become thin orchestration + domain-judgment layers that call these services, rather than each reimplementing retrieval, memory, and rule-checking independently.

### 3.4 Layer 4 — Infrastructure & Intelligence Layer

**Responsibility:** the substrate. No business logic lives here.

| Component | Notes |
|---|---|
| **LLM Gateway** | Multi-provider abstraction (Gemini primary, Claude, GPT, local models as needed) so a ministry or veto tier can be repointed without a rewrite. Existing asset: `backend/llm/geminiClient.js` — the correct shape, needs multi-provider abstraction added. |
| **API Gateway** | Single entry point for all Layer 1 applications; versioning, rate limiting, auth. |
| **Authentication & Authorization** | Role-based access (orchestrator/admin, ministry viewer, human reviewer), org-level data isolation. Required before any second CSO/tenant is onboarded. |
| **PostgreSQL** | Transactional state + append-only audit log. Replaces MVP in-memory `store.js`. **Confirmed instance**: the Intelligence Workspace's existing Supabase project, not a fresh one — ADR-0007, Accepted. Every Layer 3/4 table is either an additive extension of a real, live table or a genuinely new table in that same project; see `docs/11-Database-Schema/`. |
| **Vector DB** | pgvector, co-located in that same Supabase-hosted PostgreSQL instance — confirmed, ADR-0006 and ADR-0007 together. Used for RAG over the Knowledge Platform, the Regulatory Knowledge Layer's clause index, and Opportunity semantic search. |
| **Redis + Job Queue** | Async hand-off between ministries (drafting → veto → rewrite is a pipeline, not a request/response cycle). |
| **Object Storage** | Source documents, generated dossiers, raw crawl snapshots. |
| **Search** | Semantic + keyword search across documents, opportunities, and regulatory clauses. |
| **Observability/Monitoring** | Logging, tracing, alerting, uptime. |
| **CI/CD** | GitHub Actions; deterministic-rule tests (veto engine) are the highest-value test surface and must be bulletproof; prompts versioned independently of code so a bad prompt update rolls back without a full deploy. |
| **Security** | Secrets vault, encryption at rest, EU data residency, GDPR right-to-erasure supported by schema design (deletable, not soft-deleted). |

## 4. Domain Model (Core Entities)

This is the entity set every layer references. Full schema definition is deferred to `docs/11-Database-Schema/`; this is the authoritative naming and relationship layer that schema must conform to.

- **Organisation** — the CSO tenant. Has Users, Projects, Policies, Templates.
- **User / Role** — Product Owner, ministry viewer, human reviewer, admin. Scoped to one or more Organisations.
- **Donor** — funder/programme (EU, UNDP, USAID, foundations). Fields confirmed against the organisation's live donor pipeline (`20250904_Donor-Pipeline_Integrated.xlsx`, Google Drive): name, official website, region, funder type (trust/private foundation, pool fund, government agency, multilateral, corporate), donor status (Current Donor, Warm Prospect, Former Donor, Cold Prospect, New Funder, Revisit Prospect, Disqualified), priority horizon (short/medium/long term), relevance, areas of interest, comments, last/next action, assigned team member, and a **pipeline stage** (`DFF_Position`: Identify, Research, Ask, Cultivate, Monitor, Waiting for reply, Close) tracking relationship progression independent of any single Call. This is the seed of "Donor Intelligence" and the authoritative field list for the Donor entity — supersedes the illustrative field list in earlier planning documents.
- **Call / Opportunity** — a specific funding call under a Donor. Central entity of the Grant Studio's Opportunity Intelligence module (§10.1); schema detailed in `docs/07-Grant-Studio/`, reconciled there against the live AI Grants Scraper output.
- **Proposal** — a Concept Note or Full Application under development against a Call. Has versions, sections, a Logframe, a Budget.
- **Logframe** — intervention logic: objectives, results, indicators, baselines, targets, sources of verification, risks, assumptions.
- **Budget** — line items, unit costs, indirect cost calculation, co-financing, procurement plan.
- **Partner** — consortium member; has legal identity (PIC/PADOR where applicable), roles, mandates, capacity assessment, past cooperation history, and a **dual-lifecycle mandate**: pre-award due-diligence and mandatory administrative documentation (Legal Entity File, Financial Identification Form, Declaration of Honour, mandate letters), and post-award partnership management (subcontract/sub-grant tracking, partner-level financial reporting, periodic due-diligence refresh, performance rating feeding future consortium scoring). See Grant Studio §4 and `docs/08-Project-Operations/` for the module split; the entity itself is single and shared across both.
- **Regulatory Document** — a versioned source (PRAG, Standard Grant Contract, Guidelines for Applicants, organisational policy, national law) ingested by the Regulatory Knowledge Layer.
- **Regulatory Rule / Clause** — an extracted, citable unit from a Regulatory Document (document, version, section, article, page, effective date, jurisdiction). The atomic unit the Compliance Engine cites against.
- **Compliance Finding** — the output of a Compliance Engine check: rule cited, severity, status (PASS/WARNING/FAIL), which artefact it was checked against.
- **Ministry Task** — a unit of work assigned by the Prime Minister to a ministry within a Workflow Instance.
- **Workflow Instance** — a running instance of a Workflow Definition (state machine) tracked by the Workflow Engine.
- **Agent** — a runtime instance of a ministry's drafting/analysis logic; has a Prompt Version, a model binding (via LLM Gateway), and an identity for audit purposes.
- **Prompt / Prompt Version** — a versioned artefact in the Prompt Registry; has author, approval state, variables, test cases, rollback history.
- **Audit Event** — immutable record: who/what agent, what action, what prompt/model version, what input, what output, timestamp.
- **Knowledge Document** — institutional content (past proposals, lessons learned, evaluations, SOPs) ingested by the Knowledge Platform, distinct from Regulatory Documents.
- **Project (Post-Award)** — the implementation-phase counterpart of an awarded Proposal; owned by Project Operations; has monitoring data, financial reports, procurement records — integration point for the Intelligence Workspace asset (§8.3).

Relationships of note: a **Donor** has many **Calls**; a **Call** produces zero-or-one **Proposal** per Organisation; a **Proposal** has one **Logframe** and one **Budget** and many **Partners**; an awarded **Proposal** becomes a **Project**; every **Compliance Finding** references exactly one **Regulatory Rule**; every **Ministry Task** belongs to one **Workflow Instance** and is executed by one **Agent** bound to one **Prompt Version**.

## 5. Applications Layer — Summary Map

Full specs live under `docs/`; this table is the routing map from user-facing product to platform layer.

| Application | Lifecycle stage | Primary ministries used | Key platform services |
|---|---|---|---|
| Grant Studio | Pre-award | Fundraising, Research, Writing, M&E, Finance & Admin, Compliance | Regulatory Knowledge Layer, Compliance Engine, Context Engine, Knowledge Platform |
| Project Operations | Post-award | Reporting, Procurement, M&E, Finance & Admin, Compliance | Regulatory Knowledge Layer, Memory Engine (project memory), Workflow Engine |
| Knowledge Hub | Continuous | Development, Research | Knowledge Platform, Memory Engine (institutional memory) |
| House of Parliament | Continuous (internal) | n/a — developer tooling | Prompt Registry, Agent Runtime, Observability & Cost Service |
| Executive Dashboard | Continuous | n/a — read-only aggregation | Observability & Cost Service, Event Bus |

Grant Studio is specified in full in `docs/07-Grant-Studio/Grant-Studio-Specification-v1.0.md` (see §10 for the summary).

**Consortium Builder is the one module in v1 that spans two applications.** It is built first inside Grant Studio (pre-award: partner due diligence and mandatory PRAG/Application administrative documentation) and its `Partner` entity and workflows are then reused, not rebuilt, by Project Operations for post-award partnership management (subcontract/sub-grant tracking, partner financial reporting, periodic due-diligence refresh). See ADR-0001 (`docs/21-ADRs/0001-consortium-builder-dual-mandate.md`) and Grant Studio §4.

## 6. Regulatory Knowledge Layer (First-Class Platform Service)

This is one of the two or three most important services in the platform and is called out separately because every ministry depends on it and it is currently the largest gap between "AI proposal writer" and "compliance-defensible AI operating system."

**Principle:** a ministry never reads PRAG. It calls the Regulatory Knowledge Layer, which returns a cited answer.

```
Prompt → Regulatory Knowledge Layer → Prompt        (correct)
Prompt → [PRAG text pasted inline]                    (forbidden)
```

### 6.1 Sources (already available as project documents — ingestion targets, not future acquisitions)

- **EU**: PRAG 2025 full version; Standard Grant Contract (Special Conditions, General Conditions, Annexes); Annex A1/A2 application forms; Annex C Logical Framework; Annex G reporting/verification/guarantee/procurement/payment templates; Annex H (exclusion/selection declaration); Annex J (tax regime); Annex L (SEA-H self-evaluation); Guidelines for Grant Applicants (per call); Privacy Statement.
- **Organisation**: internal policies, HR, finance, travel, procurement, brand, templates, SOPs.
- **National**: procurement law, labour law, tax, NGO legislation, country-specific requirements (added as CSO operations expand geographically).
- **Internal / learned**: lessons learned, best practices, past proposals, evaluations, reviewer comments.
- **AI Governance**: the organisation's own AI App Register entries, DPIAs, and EU AI Act deployer-obligation documentation (see §9.3) — the platform's regulatory knowledge extends to *governing itself*, not only donor compliance.

### 6.2 Pipeline

```
Document Parser → Chunking → Metadata Extraction → Embeddings → Knowledge Graph
   → Rule Extractor → Clause Extractor → Semantic Index → Citation Engine → Compliance API
```

Every extracted clause carries: document, version, section/article, page, paragraph, effective date, jurisdiction, source, confidence, and relationships to other clauses (e.g. PRAG §6.5 "indirect costs, maximum 7%" → referenced by the Budget Validator).

### 6.3 Regulatory APIs consumed by ministries

`Compliance API`, `Eligibility API`, `Procurement API`, `Budget API`, `Reporting API`, `Visibility API`, `Contract API`, `Annex API`. Example contract:

```json
{
  "rule": "Gender mainstreaming required",
  "source": "Guidelines for Applicants, Section 2.3",
  "severity": "mandatory",
  "status": "missing"
}
```

No ministry is permitted to assert a compliance judgement without a response object shaped like this behind it. This is the mechanism that eliminates hallucinated eligibility/compliance advice — the highest-impact risk identified in the existing risk register.

### 6.4 Existing asset mapping

The **Internal Knowledge Assistant** (Gemini Gem) persona and its PRAG/EU-external-action domain expertise is the seed content and reasoning pattern for this layer — its system prompt encodes exactly the "cite the rule, flag the derogation, escalate on irregularity" behaviour this layer must operationalise as structured API responses rather than chat answers. Porting it means: (1) extracting its normative-hierarchy logic (Guidelines > contract > PRAG > internal policy) into the Rule Extractor's precedence model, and (2) retiring its conversational form once the Compliance API covers the same ground with citations.

## 7. Governance & AI-Risk Model

The Parliamentary Governance Layer (Layer 2) is the *workflow* governance mechanism. This section is the platform's *AI-risk* governance mechanism, and it is binding on every ministry and application, not optional documentation.

### 7.1 EU AI Act posture

The platform is a **deployer** of third-party and first-party GPAI systems, not a provider, for the purposes of any Regulation (EU) 2024/1689 assessment. Every ministry-facing LLM interaction inherits: human oversight logging, monitoring, and cooperation-readiness obligations (Article 26 spirit). Content that reaches a donor, board, or beneficiary-facing artefact is internally treated as **high-risk-equivalent** regardless of the formal tier, because it drives financial accountability and organisational credibility — this mirrors the standard already adopted for the existing ProposalAI Pro governance blueprint and is retained as platform-wide policy, not restated per application.

### 7.2 Human oversight is structural, not a checklist

Every AI-generated artefact that can reach a donor, Board, or beneficiary has a **named human approver** logged against it before it leaves the platform. This is enforced by the Human Gates (§3.1) and the Compliance Override control, not by ministry discretion. No ministry, including Writing and Reporting, may mark a Human Gate as satisfied programmatically.

### 7.3 Data protection

Beneficiary PII (names, vulnerability status, GPS/location data) is excluded from the Knowledge Platform's RAG index and from any prompt sent through the LLM Gateway, enforced by a pre-prompt PII filter at Layer 4. EU data residency; DPA + SCCs with any third-party model vendor; DPIA on file; 5-year audit retention for prompts/outputs in a tenant-isolated store, PII excluded.

### 7.4 AI App Register

Every application and ministry that constitutes a distinct AI-assisted function (Grant Studio's Proposal Builder, Writing Ministry, M&E's narrative generation, Reporting Studio, media/opportunity monitoring) gets an AI App Register entry: owner, purpose, vendor/model, data sources, risk tier, oversight matrix, monitoring KPIs, incident log, review cadence. Register schema and the transparency-matrix template are detailed in `docs/17-AI-Governance/`.

## 8. Existing Asset Integration Map

| Asset | Current form | Role in v1.0 architecture | Integration path |
|---|---|---|---|
| **Internal Knowledge Assistant** (Gemini Gem) | Chat-layer persona + attached PRAG/EU documents | Seed content and precedence logic for the Regulatory Knowledge Layer (§6.4) | Extract system prompt into Prompt Registry as a legacy reference; extract normative hierarchy into Rule Extractor precedence rules; source documents ingested via the Document Parser pipeline |
| **AI Grants Scraper** + **EU Concept Note Drafter** (Claude artifacts) | Claude Project chat customisations. The scraper's live output (`funding-dashboard-v5.html`, 8 June 2026 scrape) shows a materially richer schema than originally assumed: thematic clustering with per-theme confidence scores, donor-status-aware relevance weighting, a strategic-action narrative per opportunity, a risk score, change-tracked versioning, and reviewer flags — see Grant Studio §2.1 | Grant Studio's Opportunity Intelligence (scraper) and v1 of the Proposal Builder (drafter) | Not callable APIs — port prompt/persona logic into `researchMinistry.js` / Writing Ministry `buildPrompt`, superseded by the full Grant Studio spec (§10) which upgrades scope well beyond concept notes. The live scraper schema (not the originally assumed CSFM-only schema) is the canonical starting point for the Opportunity entity — see ADR-0002 |
| **Intelligence Workspace** (SaaS at `cvetanichin.org`, live Supabase project) | Not just a product to integrate with — direct code inspection (connected `FigmaProjects-main` folder) shows a live, working, simpler implementation of parts of Parliament Core (`ai_agents`/`prompt_modules`/`agent_runs`, a real Agent Invocation log) and Grant Studio's Reporting/Compliance Studios (`me-agent`, `compliance-agent`, `reporting-agent` edge functions already generating real reports against real project data, on Anthropic Claude, billed via Paddle). No governance layer (no Workflow Engine, veto, or human gate) sits in front of these agent runs today, and there is no multi-tenancy/Organisation concept — every table scopes to a single Supabase Auth user. | Project Operations application (post-award); this Supabase project is now also the Layer 4 backbone for the entire platform (ADR-0007); `ai_agents`/`prompt_modules`/`agent_runs` are the confirmed physical seed of Parliament Core's Agent Runtime, not a partial one | Full data-model access, additive only (ADR-0004) — detailed reconciliation in `docs/08-Project-Operations/Project-Operations-Specification-v1.0.md`. **ADR-0007 is Accepted**: the entire platform's new Layer 3/4 schema lives inside this same Supabase project, additively, rather than a separate PostgreSQL instance — see `docs/11-Database-Schema/` for the full table-by-table disposition and the mandatory staging-branch deployment discipline this decision requires. |
| **Civil Society Funding Monitor PRD** (Google Doc, v1.0, "Meridian AI") | Complete standalone PRD: data model, source taxonomy, scoring, dashboard IA, crawl workflow, AI assistant prompts, MVP roadmap, tech stack | Adopted as the working specification for Grant Studio's Opportunity Intelligence module — not re-derived | Referenced directly from `docs/07-Grant-Studio/`; its entity model (`opportunity`, `donor`, `source`, `crawl_log`, `saved_search`, `digest`) is reconciled with the EAS domain model (§4) as an implementation detail of the Call/Opportunity entity |
| **ProposalAI Pro Governance Blueprint** (Google Doc) | AI-risk governance case study for a comparable NGO deployment | Template and baseline for §7 (Governance & AI-Risk Model) and the AI App Register | Referenced directly; oversight matrix, transparency matrix, and mitigation-by-risk-category structure reused, not rewritten |
| **Parliamentary AI Governance & Grant Production Engine — MVP scaffold** (`parliamentary-ai-gov` repo) | Working Node/Express code: PM orchestrator, Research + Writing ministries, Tripartite Veto Engine, Vote of No Confidence loop, four human gates, in-memory store, static HTML playground | The Layer 2 seed implementation; `vetoEngine.js` is the Layer 2 client-side precursor of the Layer 3 Compliance Engine; `ministryAdapter.js` is the precursor of the Agent Runtime contract | See §11 repo restructuring plan — code is retained and re-platformed, not discarded |
| **Ministry Responsibilities and Process Flow** (Google Sheet) | Full ministry-by-ministry responsibility/output/phase/QA matrix, including out-of-scope items (Labor Market Monitor, Opportunity Screener, Application Strategy, Career Consultant, HR Assistant, Product, Advocacy, Governance) | Source of truth for the v1 Ministry Library (§3.2); non-CSO-grant items explicitly excluded from v1 per Product Owner decision (§8.4) | Ministry list in §3.2 is the authoritative subset; the sheet remains useful raw material for a possible future "Career & Talent" product line but is out of architectural scope now |

### 8.4 Explicit v1 scope exclusion

Labor Market Monitor, Opportunity Screener, Application Strategy, Career Consultant, and HR Assistant are **excluded from the v1 architecture**. They do not appear in the Layer 2 Ministry Library, the domain model, or the application registry. If revisited, they would constitute a separate product line, not an extension of the Grant/Project lifecycle, and would require their own EAS amendment via ADR.

## 9. Non-Functional Requirements

| Concern | Requirement |
|---|---|
| **Multi-tenancy** | Built into the schema from day one — confirmed, ADR-0005. Every tenant-scoped table carries `organisation_id`, enforced by PostgreSQL Row-Level Security, not deferred to Phase 5 as the prior roadmap assumed. |
| **Liability** | No fully autonomous submission path exists anywhere in the platform. The Submission Gate is always human, always logged. |
| **Auditability** | Every Compliance Ministry output and every Human Gate decision is written to an immutable, append-only audit log, timestamped and tied to the specific agent, prompt version, and model that produced it. |
| **Vendor neutrality** | No direct LLM SDK calls outside the LLM Gateway (Layer 4). Enforced at code-review level once Claude Code begins implementation. |
| **Cost control** | Per-ministry, per-proposal, and per-user cost tracked by the Observability & Cost Service; tiered model routing (cheap model for routine checks, premium model reserved for semantic veto and high-stakes judgement). |
| **Data residency & GDPR** | EU-hosted infrastructure; DPA with any model vendor; right-to-erasure supported by deletable (not soft-deleted) records. |
| **Security** | Secrets in a vault, never committed; role-based access control from the first multi-user deployment. |
| **Testability** | Deterministic Compliance Engine rules (character limits, budget arithmetic, required-field completeness) must have full automated test coverage before any semantic/LLM-based check ships alongside them — this is the highest-value test surface identified in the risk register. |

## 10. Grant Studio — Summary (full spec: `docs/07-Grant-Studio/Grant-Studio-Specification-v1.0.md`)

Grant Studio is upgraded from "Concept Note Drafter" to a complete EU Grant Preparation Environment covering the full pre-award lifecycle:

```
Opportunity Discovery → Eligibility Assessment → Go/No-Go → Consortium Builder →
Concept Note → Full Proposal → Logical Framework → Budget → Compliance Review →
Submission Package → Submission
```

Modules: Opportunity Intelligence, Eligibility Engine, Consortium Builder, Proposal Builder, Logframe Studio, Budget Studio, Compliance Studio, Submission Gateway, and Reporting Studio (interim/final narrative reporting against mandatory EU templates, using the Continuous Compliance model of §6). See the linked spec for module-level detail, data contracts, and the Civil Society Funding Monitor PRD reconciliation.

## 11. Repository & Documentation Restructuring Plan

Current repo (`parliamentary-ai-gov`) structure is retained as the Layer 2 seed and re-platformed incrementally — **not** discarded and rewritten:

| Current | Target | Notes |
|---|---|---|
| `backend/agents/pmAgent.js` | Layer 2 Prime Minister, calling Layer 3 Workflow Engine | Control flow (Vote of No Confidence loop) moves to Workflow Engine; PM keeps allocation/escalation logic |
| `backend/agents/ministryAdapter.js` | Formalised as the Layer 3 Agent Runtime contract | Same shape, promoted from convention to platform-enforced interface |
| `backend/agents/researchMinistry.js`, `writingMinistry.js` | Layer 2 ministries, calling Context Engine + Regulatory Knowledge Layer instead of inline prompts | Prompts extracted to Prompt Registry |
| `backend/agents/vetoEngine.js` | Layer 2 Compliance Ministry client of the Layer 3 Compliance Engine | Rule text extracted to Regulatory Knowledge Layer; engine calls the Compliance API rather than embedding rule logic |
| `backend/agents/humanGates.js` | Layer 1 Human Gates, platform-enforced | No functional change, formalised as a platform contract all applications must honour |
| `backend/store.js` | Layer 4 PostgreSQL + append-only audit table | In-memory store replaced; audit log schema formalised in `docs/11-Database-Schema/` |
| `backend/llm/geminiClient.js` | Layer 4 LLM Gateway | Extended to multi-provider abstraction |
| `frontend/index.html` | Retained as House of Parliament playground (Layer 1) | Production Ministries Dashboard / Grant Studio UI is new, built per `docs/13-Frontend/` |

New top-level `docs/` folder holds this EAS and all detail specs, numbered per the index in this repo's `README.md`. No implementation work proceeds against an area of `docs/` still marked `status: not yet specified`.

## 12. Governance & Development Workflow

1. **Claude (Cowork), Chief Systems Architect** — writes and maintains this EAS, detail specs, ADRs, and acceptance criteria. Does not write implementation code unless explicitly asked to.
2. **Vas, Product Owner** — reviews and approves or amends every spec before it is implementable. Nothing changes status to `Approved` without this.
3. **Claude Code, Lead Developer** — implements only specs marked `Approved`. Raises a question against the spec (not an improvised decision) when something is ambiguous. Does not add services, endpoints, or ministries not described in an approved spec.
4. **House of Parliament** — the integration/validation environment where new agents, prompts, workflows, and compliance rules are tested before promotion to the production platform.

Spec lifecycle: `Draft → Under Review → Approved → Implemented → Amended (via ADR)`. Each detail spec's front matter carries this status explicitly, matching this document's own header.

## 13. Immediate Next Specifications (Priority Order) — Complete

1. ~~`docs/03-Parliament-Core/`~~ — Workflow Engine + Agent Runtime. Done.
2. ~~`docs/05-Regulatory-Knowledge-Layer/`~~ — ingestion pipeline + Compliance API contracts. Done.
3. ~~`docs/11-Database-Schema/`~~ — replaces in-memory store, formalises the domain model in §4. Done (v1.2, extended twice: once for Project Operations §5-§7's real-table reconciliation, once for Platform Services §11).
4. ~~`docs/04-Platform-Services/`~~ — Context Engine, Prompt Registry, Memory Engine, Event Bus, Notification Engine. Done.
5. ~~`docs/08-Project-Operations/`~~ — grounded in Intelligence Workspace's actual data model. Done (v1.1).

All five items in this list are specified. Everything else in the `docs/`
skeleton remains `status: not yet specified` until the Product Owner
reprioritises — see the top-level `README.md`'s "Next step" section for
candidate next items; this EAS does not pre-select one.

## 14. Open Decisions Requiring Product Owner Input

All four decisions originally raised at v1.0 approval are now resolved. Kept
here as a record, not as open items:

- ~~Intelligence Workspace integration depth~~ — **resolved 12 July 2026**
  (ADR-0004): full data-model access, additive only — Project Operations
  reads/writes new data into Intelligence Workspace's actual schema but does
  not modify its existing code or existing tables. `docs/08-Project-
  Operations/` remains blocked on the actual data model being made available
  for review — this ADR settled *how deep*, not *what's in it*.
- ~~Vector DB choice~~ — **resolved 12 July 2026** (ADR-0006): pgvector,
  co-located with the primary PostgreSQL instance, on operational-simplicity
  and scale-fit grounds, with an explicit off-ramp to a dedicated engine if
  corpus growth ever justifies it.
- ~~Multi-tenancy timing~~ — **resolved 12 July 2026** (ADR-0005): built into
  the schema from day one via `organisation_id` + PostgreSQL Row-Level
  Security on every tenant-scoped table, not deferred to Phase 5.
- ~~Vote of No Confidence failure threshold~~ — **resolved 12 July 2026**
  (ADR-0003): a `voteOfNoConfidenceThreshold` field on each Workflow
  Definition, default 2. See `docs/03-Parliament-Core/Parliament-Core-
  Specification-v1.0.md` §2.3.1.

New open items surface as detail specs get written — see each folder's
`README.md` `status` header and the "Open Items" section of each approved
spec, rather than a running list here.
