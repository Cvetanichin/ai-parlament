# Parliamentary AI Ecosystem — Specification Set

This folder is meant to be dropped into the `parliamentary-ai-gov` repository as
`docs/`, with `00-EAS-v1.0.md` at the repo root or top of `docs/`. It is the
governance layer for how this platform gets built from here on.

## Read order

1. **`00-EAS-v1.0.md`** — the Enterprise Architecture Specification. Authoritative.
   Everything else in this folder must trace back to a section of it.
2. **`docs/07-Grant-Studio/Grant-Studio-Specification-v1.0.md`** — the pre-award
   application spec (§2 and §4 confirmed, rest draft).
3. **`docs/03-Parliament-Core/Parliament-Core-Specification-v1.0.md`** — Workflow
   Engine + Agent Runtime, the Layer 3 services `pmAgent.js` and
   `ministryAdapter.js` re-platform onto. Draft; §2.3.1 confirmed.
4. **`docs/05-Regulatory-Knowledge-Layer/Regulatory-Knowledge-Layer-Specification-v1.0.md`**
   — the compliance/citation engine every ministry calls instead of embedding
   rule text. Draft, grounded in the real PRAG/Annex documents.
5. **`docs/11-Database-Schema/Database-Schema-Specification-v1.0.md`** (v1.2) —
   the single consolidated physical Supabase/PostgreSQL schema for the whole
   platform, with multi-tenancy and pgvector built in. Following ADR-0007
   (Accepted), this is additive `ALTER TABLE` migrations against the real,
   live Intelligence Workspace tables plus genuinely new tables — not a fresh
   schema for a separate instance. v1.2 adds §11, the Platform Services
   Domain.
6. **`docs/08-Project-Operations/Project-Operations-Specification-v1.0.md`**
   (v1.1) — grounded in the real, live Intelligence Workspace codebase.
   Decided, not blocked: Consortium Builder's post-award tables, the
   multi-tenancy retrofit (one Organisation per consultancy at v1), the
   Agent Runtime extension, and a permanent dual-path governance model
   (ungoverned internal drafts, Human-Gated donor/partner-facing output).
7. **`docs/04-Platform-Services/Platform-Services-Specification-v1.0.md`** —
   Context Engine, Prompt Registry (extends `prompt_modules` again), Memory
   Engine (new `memory_entries`, five-tier), Event Bus (`platform_events` +
   Supabase Realtime), Notification Engine. Last item in EAS §13's original
   priority list.
8. **`docs/06-Knowledge-Platform/Knowledge-Platform-Specification-v1.0.md`** —
   institutional document ingestion (past proposals, SOPs, lessons learned),
   chunk-level embeddings, a lightweight entity-link "knowledge graph."
   Shares its parsing/chunking pipeline with the Regulatory Knowledge Layer
   as a common library, keeps separate tables and downstream stages. Also
   corrects an EAS §3.3 inaccuracy: this service has no confirmed seed
   corpus — that's the one blocking open item (spec §8).
9. **`docs/`** — the remaining numbered folders, one per detail area, each with a
   `README.md` stub carrying a `status` header. Most still read
   `not yet specified` — the priority-ordered list in EAS §13 is fully
   drafted; what comes next is a fresh prioritisation call, not a queued item.

## The rule this whole set exists to enforce

> Claude Code (or any coding agent) implements only what is specified here.
> If a spec is ambiguous or silent, the right move is to ask, not to assume.

Concretely:

- **Claude (Cowork)** is Chief Systems Architect: writes and maintains the EAS,
  detail specs, and ADRs. Doesn't write implementation code unless explicitly
  asked to.
- **You (Vas)** are Product Owner: the only approval authority. A spec is not
  binding until you approve it — mark it in the doc's `status` header.
- **Claude Code** is Lead Developer: implements only specs marked `Approved`.
  When something is genuinely unclear, it raises a question against the spec
  rather than inventing behaviour.

Spec lifecycle: `Draft → Under Review → Approved → Implemented → Amended (via ADR)`.
Every architecture change — including ones Claude Code discovers are needed
mid-implementation — goes through `docs/21-ADRs/` first, gets your sign-off, and
only then updates the EAS or a detail spec.

## What changed from the prior roadmap

`Parliamentary_AI_Engine_Roadmap.md` (the original MVP planning document) was
never actually committed to this repo — it existed only outside version
control, referenced here for continuity with Phase 0–1 decisions and
budget/risk data that's still accurate, not as a file you can open in this
tree. The EAS is what governs structure now; its phase table is superseded
by `docs/20-Roadmap/Roadmap-Specification-v1.0.md`, which is written and
Approved (see Session 3 below).

## Existing assets — where they went

| Asset | Lives on as |
|---|---|
| Internal Knowledge Assistant (Gemini Gem) | Seed content + precedence logic for the Regulatory Knowledge Layer (`docs/05-`) |
| AI Grants Scraper (Claude artifact) | Grant Studio's Opportunity Intelligence — schema confirmed against its live output, `funding-dashboard-v5.html` (see ADR-0002) |
| EU Concept Note Drafter (Claude artifact) | Proposal Builder v1 |
| Intelligence Workspace (cvetanichin.org) | Integration target for Project Operations (`docs/08-`) — pending your decision on integration depth |
| Civil Society Funding Monitor PRD | Adopted directly as the Opportunity Intelligence infrastructure spec (source registry, crawl scheduling, dashboard IA), reconciled against the live scraper schema in Grant Studio §2 |
| Donor pipeline (`20250904_Donor-Pipeline_Integrated.xlsx`, Google Drive) | Confirmed seed source for the Donor entity (EAS §4) and Grant Studio's Opportunity Intelligence module |
| ProposalAI Pro Governance Blueprint | Baseline for the AI Governance model (EAS §7, `docs/17-`) |
| `parliamentary-ai-gov` MVP scaffold | Re-platformed, not rewritten — see EAS §11 for the file-by-file mapping |

## Status

**`00-EAS-v1.0.md` is approved** (12 July 2026). It governs from here on.

Two amendments were made and logged as ADRs rather than silently edited in:

- **ADR-0001** — Consortium Builder gets a dual pre-award/post-award mandate
  (partner compliance and mandatory PRAG/Application documents pre-award;
  subcontract tracking, partner reporting, and amendment management
  post-award), confirmed in scope for the first Grant Studio increment.
- **ADR-0002** — Opportunity Intelligence's schema is confirmed against the
  live AI Grants Scraper output (`funding-dashboard-v5.html`) rather than the
  originally assumed CSFM PRD schema alone, and the donor pipeline spreadsheet
  is confirmed as the Donor entity's real seed source.

Grant Studio §2 and §4 are accordingly no longer provisional; the rest of that
spec (§3, §5–§9) is still draft.

## Next step

**EAS §13's priority-ordered list is fully drafted, plus one beyond it.**
All five original items — Parliament Core, Regulatory Knowledge Layer,
Database Schema, Platform Services, Project Operations — have specs, all
seven ADRs are Accepted, and `docs/06-Knowledge-Platform/` (not on the
original list, but referenced by several completed specs as a dependency)
is now specified too: institutional document ingestion, chunk-level
embeddings, a lightweight entity-link table standing in for a full
knowledge graph, sharing its parsing pipeline with the Regulatory Knowledge
Layer rather than duplicating it. Writing it also surfaced and corrected a
real inaccuracy in EAS §3.3 (it claimed a seed corpus this service doesn't
actually have — fixed in place). All new DDL across both `docs/04-` and
`docs/06-` is consolidated into `docs/11-Database-Schema/` (now v1.3) as the
single schema source of truth.

**`docs/19-Deployment/` is now specified and Approved — the one item that
was genuinely urgent is closed.** ADR-0007's mandatory staging-validation
discipline now has a real runbook, and a real staging Supabase project
(`Consultancy Dashboard - Staging`, `eu-west-1`, $0/month, structurally at
parity with production) is provisioned, not just described. The account
turned out to be on Supabase's Free plan — native Branching (what ADR-0007's
text used as its example mechanism) isn't actually available yet — so this
uses the ADR's documented fallback (a separate staging project) instead,
with the Branching-based approach written up as the target to graduate to
once a Pro plan is worth paying for (`docs/19-` §6).

**A fresh prioritisation call is still needed for what's next.** Reasonable
candidates, unordered: the remaining Grant Studio modules (§3, §5-§9 —
Eligibility Engine, Proposal Builder, Logframe Studio, Budget Studio,
Compliance Studio, Reporting Studio, Submission Gateway, still draft beyond
the confirmed §2/§4); `docs/10-House-of-Parliament/` (referenced by both
the Prompt Registry's approval workflow and the Memory Engine's
institutional-tier curation open item — increasingly a dependency of
already-approved specs, not just a nice-to-have); or `docs/16-Security/`
(load-bearing for the Notification Engine's secret storage, still `not yet
specified`).

`docs/06-Knowledge-Platform/` has no open items left (v1.1): a dedicated
Google Drive folder ("Knowledge Platform Seed Corpus," structured into six
subfolders matching the `document_type` taxonomy) has been created as the
confirmed v1 seed source, and the Template Detection confidence threshold
is decided (reuses the Regulatory Knowledge Layer's 0.6 default, backed by
a new `knowledge_documents.review_status` column). Populating the folder
with actual content is an editorial task for whoever owns that material,
not an architectural one.

## Product Owner Approval — 12 July 2026

Five specs are now **Approved**, cleared for Claude Code to implement:

| Spec | Status | Notes |
|---|---|---|
| `docs/04-Platform-Services/` | Approved | 3 non-blocking follow-ups remain in §8, deferred to specs not yet written (`docs/10-`, `docs/15-`, `docs/16-`) |
| `docs/06-Knowledge-Platform/` | Approved | Zero open items |
| `docs/08-Project-Operations/` | Approved | Zero open items |
| `docs/11-Database-Schema/` (v1.3) | Approved | 5 non-blocking follow-ups remain in §14, same pattern — deferred to not-yet-written specs, none block implementing what's already defined |
| `docs/19-Deployment/` | Approved | Provisioned, not just written — a real staging Supabase project exists; its two flagged security findings are now fixed and verified at the database level (§8 below) |
| `docs/05-Regulatory-Knowledge-Layer/` (v1.1) | Approved | Zero open items — all four resolved (see below) |

**`docs/05-Regulatory-Knowledge-Layer/` is now Approved too** — its four
open items are all resolved without requiring facts about the
organisation's actual grant portfolio that weren't available: the
extraction confidence threshold is decided (0.6, the platform-wide
default); national law is out of scope for Wave 1 by default, revisited
only on a specific country need; the organisational policy corpus has a
confirmed Drive folder (structured by category, empty until populated);
and legacy PRAG versions get a fallback mechanism (`projects.prag_version`
+ a `legacy_prag_pending` finding status) that handles the question
architecturally regardless of whether such a grant actually exists.

**What's still deliberately out of scope (as of Session 2 — see Session 3
below for what closed this):** `docs/03-Parliament-Core/` remains `DRAFT`.
Its §0 source-grounding caveat (`pmAgent.js`/`ministryAdapter.js` couldn't
be read from GitHub) is queued — pending GitHub plugin authorization on
your end, picked up as soon as that's live.

## Product Owner Approval — 12 July 2026 (Session 2)

Three more specs are now **Approved**, closing the "fresh prioritisation
call" this document asked for above — House of Parliament and Security
because they were load-bearing dependencies of already-Approved specs, and
Grant Studio's remaining modules because they were the largest actual
product-surface gap:

| Spec | Status | Notes |
|---|---|---|
| `docs/10-House-of-Parliament/` | Approved | Resolves institutional memory curation authority and the prompt-promotion interface (previously open against Platform Services §8 and Database Schema §14); introduces `profiles.is_platform_operator` |
| `docs/16-Security/` | Approved | Resolves notification channel secret storage (Supabase Vault) and the RBAC permission matrix (four-role enum + platform-operator boundary); PII filter design, GDPR erasure rule, and MFA scope also specified |
| `docs/07-Grant-Studio/` (all modules, §2-§10) | Approved | §3, §5-§10 upgraded from narrative-only to data-contract + API-surface detail against `docs/11-` v1.3; found and fixed a real gap (`indicators` was `project_id`-only, needed for pre-award Logframe Studio); resolved Consortium Builder's post-award ministry assignment (a joint Procurement/Finance/Compliance/M&E Committee) |
| `docs/11-Database-Schema/` (now v1.4) | Approved | §15 consolidates all follow-on DDL from the three specs above — the single schema source of truth stays single, per this project's established pattern |

**What's still deliberately out of scope:** `docs/03-Parliament-Core/`
remains `DRAFT`, blocked as above. Everything else still `not yet
specified` (`01-Product-Vision`, `02-Domain-Model`, `09-Intelligence-
Workspace`, `12-APIs`, `13-Frontend`, `14-Backend`, `17-AI-Governance`,
`18-Testing`, `20-Roadmap`) is untouched this round — a fresh
prioritisation call for what comes next, not pre-selected here.

**Before Claude Code implements any of this round's approvals:** the five
new/follow-on tables and columns in Database Schema §15 need to actually be
migrated (through the staging branch discipline, ADR-0007) — they are
currently approved *specification*, not yet applied schema. `reports_
report_type_check` specifically touches a real, live table and its exact
current constraint name/values were not verified against the live database
that session — confirm before applying.

## Session 3 — Parliament Core Unblocked, Full Spec Set Complete

**The GitHub read block on `docs/03-Parliament-Core/` is resolved — without
GitHub.** A local, unzipped copy of the real MVP repo was found at
`~/Downloads/parliamentary-ai-mvp/` and read in full (`pmAgent.js`,
`ministryAdapter.js`, `vetoEngine.js`, `humanGates.js`, `store.js`,
`geminiClient.js`, `server.js`, plus both ministry files). **Verdict: the
spec's migration sections, built from the README alone, matched the real
code closely — a confirmation pass, not a redesign.** The Vote of No
Confidence threshold default (2), the four human gates, the veto engine's
three tiers, and the Ministry Adapter contract all checked out exactly.
Two genuinely new, real details were folded in: the confidence heuristic
(`high`/`medium`/`low`, §2.3.2 — an actual algorithm already in
`pmAgent.js`, not a placeholder) and the real `409` gate-precondition
enforcement pattern from `server.js`. One scope clarification worth
knowing: only 2 of the 9 v1 Ministries (Research, Writing) have any
existing code — the other 7 are net-new, built to the Ministry Adapter
contract from scratch, not re-platformed from anything.
**`docs/03-Parliament-Core/` is now Approved.**

**All nine remaining `not yet specified` areas now have a first full spec,
and — following your amend-then-approve instruction — all nine are now
Approved:**

| Spec | Notable content |
|---|---|
| `docs/01-Product-Vision/` (now v1.1) | Problem statement, persona value props, explicit non-goals, plus (as of this session) a proposed brand — **Quorum** — and five concrete v1 success-metric targets |
| `docs/02-Domain-Model/` | Full ER diagram (Mermaid) + entity dictionary consolidating six specs' worth of scattered entity definitions; introduces zero new entities |
| `docs/09-Knowledge-Hub/` (renamed from "Intelligence Workspace / Knowledge Hub") | **The naming collision is resolved, per your amendment request — ADR-0008.** This application is now named Knowledge Hub, full stop; "Intelligence Workspace" refers exclusively to the existing SaaS product re-platformed into `docs/08-Project-Operations/`. EAS §3.1 and §5 were amended in place to match — the first text amendment to the EAS document itself since v1.0. Folder and spec file renamed accordingly. |
| `docs/12-APIs/` | Gateway cross-cutting contract (versioning, auth, error shape, rate limiting) + a routing index to every endpoint's real owning spec — no contracts re-derived |
| `docs/13-Frontend/` | One React shell across all four Layer-1 apps (not four deployments), a reusable Human Gate UI component, and the direct-Supabase-vs-Gateway data-fetching rule |
| `docs/14-Backend/` | **Revises** the historical roadmap's Node+Python split: Node/Deno (Supabase Edge Functions) is primary; Python is scoped narrowly to document ingestion only |
| `docs/17-AI-Governance/` | AI App Register, human oversight matrix, EU AI Act obligation-to-logging mapping, incident playbook — and the confirmed home of the Observability & Cost Service. New DDL folded into Database Schema §16 (v1.5). |
| `docs/18-Testing/` | Priority-ordered test pyramid; Veto Engine regression suite's first two golden-file cases pulled directly from real `vetoEngine.js` fallback logic |
| `docs/20-Roadmap/` | Six-phase build sequence by actual dependency; flags one real sequencing risk (the PII filter lands in Phase 4 but PII-bearing ingestion starts in Phase 1) |

**The full `docs/` skeleton now has an Approved spec everywhere** — every
folder that was `not yet specified` now has content, and every spec in the
repository is `APPROVED` except nothing.

**ADR-0008** (`docs/21-ADRs/0008-knowledge-hub-naming.md`) is the record of
the naming amendment: `docs/09-Intelligence-Workspace/` → `docs/09-
Knowledge-Hub/`, its spec file renamed to `Knowledge-Hub-Specification-
v1.0.md`, and EAS §3.1/§5 both edited in place to say "Knowledge Hub"
instead of "Intelligence Workspace / Knowledge Hub." No functional,
data-model, or API change accompanies it — naming only.

## §8. Staging Hardening — Findings Fixed

Two of the findings flagged when `docs/19-Deployment/`'s staging project
was first stood up are now fixed and verified directly against the
database (not just the advisor report, which can lag): the `vector`
extension is out of the `public` schema, and `handle_new_user()`'s
`search_path` is pinned. A third finding, surfaced only once those two
cleared — `handle_new_user()` was still callable via RPC by `PUBLIC` — is
also fixed, confirmed via a direct `information_schema` query rather than
the advisor cache. **These fixes exist on staging only.** Promoting the
identical migration to production (`jorpfsrvhnelnboupiyx`) is `docs/19-`
§3 step 5 — held for your explicit go-ahead before touching the live,
billed project, even though the change is low-risk.

**Decided, logged as ADRs (`docs/21-ADRs/`):**

| ADR | Status | Decision |
|---|---|---|
| 0001 | Accepted | Consortium Builder — dual pre-award/post-award mandate |
| 0002 | Accepted | Opportunity Intelligence — live scraper schema is canonical |
| 0003 | Accepted | Vote of No Confidence threshold — per-Workflow-Definition, default 2 |
| 0004 | Accepted | Intelligence Workspace integration — full data-model access, additive only |
| 0005 | Accepted | Multi-tenancy — built into the schema from day one |
| 0006 | Accepted | Vector store — pgvector, co-located with PostgreSQL |
| 0007 | Accepted | Supabase (Intelligence Workspace's existing project) as the Layer 4 backbone |
| 0008 | Accepted | Rename `docs/09-` to "Knowledge Hub" — resolves its naming collision with Project Operations |
| 0009 | Accepted | Governance Layer cutover — shadow-run strategy, one ministry at a time, compliance-agent first |
| 0010 | Accepted | Embedding provider and a shared embedding pipeline (not per-service duplication) |
| 0011 | Accepted | Prompt Orchestration Platform absorbed into Parliament Core — no separate Supabase project/control-plane; specialist/validator/formatter modules become `ai_agents`/`prompt_modules` rows sharing one Edge Function |
| 0012 | Accepted | Schema-enforced structured output via Anthropic tool-use (`generateStructured`), not the OpenAI Responses API — no second provider introduced |
| 0013 | Accepted | Grant Studio Web: `withCors()` as the standing pattern for every Edge Function; pre-award `projects` row anchoring (`stage='pre_award'`) for proposal-scoped agent/workflow activity, no schema change |

Every migration touching a real, live table (§1, §3, §5 of the Database
Schema spec) is now a hard requirement to validate on a Supabase branch or
cloned staging project before promotion — this is ADR-0007's mitigation,
not optional discipline, and it applies before the first Parliament Core
migration is written.

~~**Still flagged:**~~ the Parliament Core spec's migration sections
described the target contract for `pmAgent.js`/`ministryAdapter.js` based
on the repo's README, not the actual current source — raw GitHub reads
returned empty repeatedly. **Resolved in Session 3** (see below): the real
source was found locally instead and read in full; no diff against GitHub
was ever needed. **Minor flag, not architecturally significant, still
open:** the Intelligence Workspace repo's own `CLAUDE.md` says Stripe; the
actual code runs Paddle — worth a doc fix whenever convenient.

## Session 4 — Staging Fully Migrated, Product Vision's Open Items Closed

**Every migration in `docs/11-Database-Schema/` §1–§16 is now applied to
staging, not just approved on paper.** Connected directly to Supabase and
ran all ten migrations (`01_multi_tenancy` through `10_performance_
hardening`) against `Consultancy Dashboard - Staging`
(`urhocsijfzkepebsmstx`) — the project that, until this session, mirrored
production's original 12 tables and nothing else. It now has all 40 tables
this platform's approved specs call for, full RLS coverage, and **zero
security advisor lints**. Full record, including three deliberate
deviations from the spec text (all improvements, not corrections — a
generalised multi-table backfill, `agent_runs`' append-only revoke
correctly held back pending its still-undecided security-definer-function
mechanism, and a from-scratch performance pass) is in Database Schema §17.

**The performance pass wasn't optional cleanup — it found 204 real lints**
(zero `ERROR`) after the first nine migrations: 83 RLS policies re-evaluating
`auth.uid()` per row instead of once, and 69 foreign keys with no covering
index. Both are exactly what Supabase's own advisor flags as the standard
"wrote it correctly but not performantly" pattern, and both got fixed in one
more migration rather than left as a known issue. What's left (121 lints) is
entirely expected: unused-index notices on tables with zero rows, and the
multiple-permissive-policies warning that's the direct, intended consequence
of the dual-RLS design the spec itself called for.

**Production (`Consultancy Dashboard`, `jorpfsrvhnelnboupiyx`) was not
touched.** Staging passing cleanly is what that discipline (ADR-0007) exists
to produce — it's a precondition for asking about production, not a reason
to skip asking.

**`docs/01-Product-Vision/`'s two open items are closed, not left for later**
— you asked for inventive answers, not another deferral:

- **Brand name: Quorum.** A quorum is literally the minimum presence
  required before a body can act — which is what the four Human Gates
  already enforce mechanically. Reads as credible in EU/UNDP donor contexts,
  carries no political baggage the way "Parliamentary AI" risks in front of
  a donor, and works as a prefix for every existing application name
  without renaming any of them (Quorum Grant Studio, Quorum Project
  Operations, Quorum Knowledge Hub). Working tagline: *"Nothing proceeds
  without quorum."* Proposed, not locked in — flagged for explicit sign-off
  before it appears anywhere external.
- **Five concrete v1 success-metric targets**, each tied to a Roadmap phase
  and an existing data source (no new instrumentation needed): ≥50%
  reduction in late-caught compliance defects, ≥30% faster proposal cycle
  time, ≥40% institutional-knowledge reuse, 100% platform adoption for new
  proposals, ≥80% of invocations on cost-efficient models. Win rate stays
  tracked-not-targeted, for the reason already given — too confounded by
  factors outside the platform's control to be a fair target.

Product Vision is now **v1.1**.

## Session 5 — Production Migrated, Brand Hierarchy Confirmed

**1) Production is now migrated — the identical, staging-validated schema,
promoted with your explicit go-ahead.** `Consultancy Dashboard`
(`jorpfsrvhnelnboupiyx`) went from its original 12 tables to the full 40,
same ten migrations, same order, same content as staging. Two things had
to be handled differently precisely because production isn't staging's
empty sandbox:

- **Real data got a real backfill**, not just compatible schema. Checked
  first: one real project (`HERA VOL 2`), three documents, a report, six
  agent runs, all belonging to one real user. The multi-tenancy migration
  was extended with explicit `UPDATE` statements so that data landed inside
  a real `organisations`/`organisation_members` row instead of sitting at
  `organisation_id = NULL` waiting for someone to notice later. Verified
  after: 1 organisation, 1 member, every real row correctly scoped.
- **The `agent_runs` append-only revoke was held back again, more
  deliberately this time** — production's edge functions are live,
  serving real traffic, not a smoke test. Revoking `UPDATE` without the
  still-undesigned security-definer status-transition function would have
  broken something actually in use, not a hypothetical.

Pre-migration checks (schema shape, existing constraints, the one real
`reports.report_type` value) confirmed production was structurally
identical to staging's pre-migration state before a single statement ran.
New RLS policies were written correctly the first time — zero
`auth_rls_initplan` findings appeared at any point on production, versus
staging's initial 83, because that lesson was already learned. Post-
migration: full RLS on all 40 tables, zero new security lints (one
pre-existing, unrelated Auth setting — leaked-password protection — is
untouched, out of scope). **Both Supabase projects now run the identical,
fully-approved schema.** Full record: Database Schema §18.

**2) Brand hierarchy confirmed** — your refinement of the single "Quorum"
proposal into a proper layered structure:

| Layer | Brand |
|---|---|
| Company | **Cvetanichin** |
| Platform | **CSO Playground OS** |
| AI Governance Engine | **Quorum Engine** |
| Pre-award Suite | **Grant Studio** |
| Post-award Suite | **Project Operations** |
| Knowledge Platform | **Knowledge Hub** |
| Developer Environment | **House of Parliament** |

This is a genuine refinement, not a reversal: "Quorum" now names
specifically the governance/compliance mechanism it was always describing
(the four Human Gates, the Tripartite Veto Engine) rather than standing in
for the whole platform — more precise, since the governance layer is what
actually has the quorum-like property, not the document editor or
dashboard. **Cvetanichin** as the company brand matches the existing SaaS
product's own domain (`cvetanichin.org`) rather than introducing a
competing identity. Every application-level name (Grant Studio, Project
Operations, Knowledge Hub, House of Parliament) is confirmed exactly as
already specified — nothing renamed, just placed correctly in the
hierarchy. Product Vision is now **v1.2**.

## Session 6 — Prompt Orchestration Platform Absorbed; Grant Studio Web Frontend Built and Verified Live

**Prompt Orchestration Platform (POP), a separate system uploaded
independently of this spec set, is folded into Parliament Core rather than
run alongside it (ADR-0011).** No new Supabase project, no separate
control-plane: POP's specialist/validator/formatter modules for its three
v1 domains (`monitoring_and_evaluation`, `product_and_mvp`,
`prompt_engineering`) became new `ai_agents`/`prompt_modules` rows sharing
one Edge Function (`prompt-orchestration-run`), reusing the existing
Workflow Engine/Veto Engine machinery instead of duplicating it. Schema:
5 new tables + additive columns
(`supabase/migrations/20260720140000_17_prompt_orchestration_schema.sql`),
seeded with 7 agents, 3 workflow definitions, and priority-ordered routing
rules
(`..._18_prompt_orchestration_seed.sql`), both applied to staging. A
77-prompt independent prompt library (`PromptLibraryV7_2.jsx`, a separate
product called "Prompt Architect Pro") was reviewed per your instruction —
its genuinely useful specialist-prompt content was mined into Grant
Studio's specialist prompts
(`apps/prompt-orchestration-platform/docs/SPECIALIST_PROMPTS_SEED.md`) and
the library itself retired, not carried forward as a competing system.

**ADR-0012** extends `llmGateway.ts` with `generateStructured()` — Anthropic
tool-use forcing a single tool call, functionally equivalent to OpenAI's
strict Structured Outputs but on the provider every agent in this platform
already runs on. No second provider, no second credential, no
provider-selection branch for future strict-output agents.

**Live end-to-end test of the Prompt Orchestration pipeline found and fixed
two real bugs, both only reachable against a real model, not the mock
path:** `max_tokens: 1024` truncated specialist/validator responses
mid-sentence (why `validator_indicators` never reached its required
`Assessment:` line); raising it to 4096 fixed truncation but pushed a
2-retry M&E run's wall-clock time past the Edge Function platform's limit
(150s free / 400s paid). Settled on `2048` as a pragmatic interim value —
explicitly **not** claimed as proven-sufficient; the real fix (moving
multi-call, retry-capable workflows off a single synchronous request onto
background execution) is flagged as necessary Phase 2+ architecture work,
not silently deferred.

**Grant Studio gets its first real frontend — `apps/grant-studio-web`,
Phases A–D built and live-verified (genuine, billed Anthropic calls, not
mocked).** Prompted by a request to consolidate a Lovable-built prototype
(`Cvetanichin/grant-stream-studio`, "CivicFlow") into one working app:
investigation found a genuinely useful pre-award grant UI (Funding
Pipeline, Concept Note/Full Application editors, an EU 90/10/7% budget rule
engine) but zero usable backend — a third, empty Supabase project,
localStorage-only persistence via Zustand, no AI, no governance concept at
all. Rather than adopt its Cloudflare Workers/TanStack Start stack (absent
everywhere else in this platform), the decision was a new plain
Vite+React+TypeScript+shadcn/ui SPA inside this repo, porting the UI
patterns onto the real `cso-playground` schema:

- **Phase A** — authenticated shell, real Supabase Auth (session
  persistence, sign-out, redirect guards both directions — the existing
  MVP playground's auth scaffolding existed in source but was never wired
  to anything), and the reusable Human Gate UI component
  (`docs/13-Frontend/` §4) rendering whatever Gate Request record it's
  given. **PR #11, merged.**
- **Phase B** — Opportunity Pipeline: KPI strip, cluster/status filters,
  urgency-coloured deadlines, against the real `opportunities`/`donors`
  tables; "Start proposal from this call" creates a real `proposals` row.
- **Phase C** — Eligibility Report + a real Go/No-Go gate (a genuine
  Research Ministry call producing a real risk matrix, not mocked). This
  surfaced two real, previously-invisible gaps: **every Edge Function in
  this repo had only ever been called server-to-server (curl, service-role
  JWTs) — grant-studio-web is the first real browser caller, and every call
  failed at the CORS preflight with an opaque "Failed to fetch"**, fixed
  with a `withCors()` wrapper applied to all six functions (ADR-0013); and
  the real gate machinery (`agent_runs.project_id` `NOT NULL`) requires a
  `projects` row even pre-award, resolved by anchoring each proposal to a
  `projects` row at `stage='pre_award'` — a value the schema's own `CHECK`
  constraint already allowed, not a new mechanism.
- **Phase D** — Concept Note drafting via the actual Writing Ministry →
  Tripartite Veto Engine → Vote of No Confidence loop → Polish Gate (not
  Prompt Orchestration's `prompt-orchestration-run`, a separate system for
  POP's own three domains). Live-verified including a real veto failure (a
  genuine ~4800-character Claude draft correctly failed a 4000-character
  deterministic constraint), a Vote of No Confidence retry, escalation, and
  a Compliance Override correctly requiring and recording a justification.
  **Real, deliberate scope decision, not an oversight:** Grant Studio spec
  §5 describes each donor section as its own drafting Workflow Instance;
  the already-built, already-verified `workflowEngine.ts` implements one
  continuous instance per proposal instead — v1 drafts one holistic
  narrative section to match what's actually deployed, recorded in
  ADR-0013 rather than silently forcing the fuller model or silently
  falling short of the spec.
- **PR #12, open against `main`**, covers Phases B–D plus the CORS/ADR-0013
  work — PR #11 had already merged with only Phase A's two commits, so
  subsequent phases landed on the same branch with no PR tracking them
  until this was caught and a fresh PR opened with an accurate,
  live-verified description.

**What's still genuinely open, flagged rather than silently resolved:**
`decideGate` does not yet hard-block the Go/No-Go gate server-side if no
`eligibility_reports` row exists (Grant Studio §3's stated requirement) —
today the Eligibility Report is surfaced in the gate's UI, which is a
convenience, not the enforcement `docs/13-Frontend/` §7's "no
client-side-only gating" NFR calls for. Per-donor-section Workflow
Instances (§5's fuller model) remain unbuilt, per the scope decision above.
Grant Studio Web's remaining phases (Logframe, Budget, Compliance/
Submission, Consortium) are unbuilt.

## Session 7 — cso-playground Recreated After Accidental Deletion; Local Dev Environment; Sign-Up/Forgot-Password

**The `cso-playground` Supabase project (`urhocsijfzkepebsmstx`) was
accidentally deleted mid-session** — confirmed via `list_projects`
returning empty for the whole org, not just a paused/hidden state. A
second, unrelated production project under the same org ("Consultancy
Dashboard", `jorpfsrvhnelnboupiyx`) was lost at the same time; that
recovery (Supabase support, backup/PITR options) was handed back to the
Product Owner to pursue directly — out of scope for this session, and not
something schema replay can help with (it recovers structure, never data).

**Recreated `cso-playground` from scratch** (new ref `zfadrhpnhejzbpnfizxu`,
`eu-west-1` per ADR-0006): replayed the base "Intelligence Workspace"
schema (3 files — `initial_schema`, `fix_rls_performance_and_indexes`,
`profiles` — previously living only on disk in a separate project, never
committed to this repo) followed by all 20 of this repo's own migrations,
then redeployed all 7 real Edge Functions. Confirmed via `list_tables`: 46
tables, RLS enabled on every one, seed data intact (4 workflow
definitions, 13 `ai_agents`, 10 `prompt_modules`).

**Full local, Docker-based Supabase dev environment** now actually works
from this repo alone — previously impossible, since the base Intelligence
Workspace schema (above) had never been committed here. Installed Docker
Desktop, ran `supabase start`, and copied the 3 base-schema files into
`supabase/migrations/` with early (`00000000000001`–`4`) timestamps so
`supabase start` can build the complete schema without a second project on
disk. `apps/grant-studio-web/.env.local` (gitignored, takes priority over
`.env`) points the dev server at the local stack; `.env` still points at
the hosted project.

**Grant Studio Web's Login page gained sign-up and forgot-password**,
verified live against both environments (hosted requires email
confirmation; local doesn't by default).

**Five real bugs found and fixed while actually exercising this live for
the first time** (the hosted project's email-confirmation requirement had
silently prevented the self-serve org-bootstrap path from ever running
end-to-end before now):

1. `indicators_insert`'s RLS policy only checked `project_id`, unlike its
   sibling `select`/`update`/`delete` policies — silently blocked every
   pre-award indicator insert (`proposal_id` set, `project_id` null),
   needed for the upcoming Logframe Studio phase. Fixed (migration 19).
2. Local Postgres via `supabase start` doesn't replicate the hosted
   platform's automatic table-privilege grants to
   `anon`/`authenticated`/`service_role` — every table needed an explicit
   `GRANT`, added for both local and hosted (migration 21; hosted's was a
   harmless no-op).
3. `INSERT ... RETURNING` on a brand-new `organisations` row raised an RLS
   error rather than silently omitting it, since no `SELECT` policy could
   see the row yet (its `organisation_members` row didn't exist until the
   *next* insert) — genuine Postgres RLS behaviour, not a config bug.
4. A zero-members subquery in `organisation_members_insert_bootstrap`'s
   `WITH CHECK` queried the very table the policy was defined on, causing
   Postgres to detect infinite recursion (migration 22 fixed this with a
   `SECURITY DEFINER` helper — subsequently itself superseded, see next).
5. **Found via a direct code review of the PR carrying fixes 3–4, not by
   live testing**: the two client-side inserts (organisation, then
   membership) had no protection against two concurrent executions for
   the *same* user — e.g. two tabs open right after signup — each
   independently passing the zero-members check and each creating their
   own brand-new organisation. Fixed (migration 23) by replacing both RLS
   insert policies and the zero-members helper with one atomic,
   `SECURITY DEFINER` RPC (`bootstrap_own_organisation`) that serializes
   concurrent calls per-user via a transaction-scoped advisory lock.
   Verified with 5 genuinely concurrent `curl` calls for one user: all
   returned the same organisation id, exactly one row created. See
   ADR-0014's 2026-07-29 update for the full account — this is now the
   *third* revision of that ADR's actual mechanism, each superseding the
   last as real bugs were found; the underlying decision (a zero-members
   check is the correct security boundary) never changed, only how it's
   enforced.

Also found and fixed in the same pass: a wrong local auth redirect port
(`supabase/config.toml`'s `site_url` was `127.0.0.1:3000`; the actual Vite
dev server runs on `5173`) — confirmed via Mailpit that a real local
password-reset email now carries the correct `redirect_to`.

**Two merge-order mishaps this session, both caught and recovered, not
silently left broken:** PR #14 was merged by its author while it still
only contained its first of two commits — the second commit (the actual
fixes for bugs 3–4 above) was pushed to the branch *after* the merge
already happened, so it never reached `main` until this was noticed (the
files visibly reverting to their pre-fix state was the tell) and the
orphaned commit was cherry-picked onto a fresh branch and shipped as PR
#15. This is the same class of mistake flagged once already this project
(see the PR-hygiene note, Session 6) — worth being extra vigilant about
push-then-immediately-verify-merge-state going forward, on both sides.

**Still outstanding, on the Product Owner's side, not this session's to
resolve:** `ANTHROPIC_API_KEY` (and `OPENAI_API_KEY` if embeddings are
needed) must be set as secrets on the new `cso-playground` project before
any AI-agent feature works again — nothing in this repo ever stores those
values, by design, so they don't survive a project recreation. The real
"Consultancy Dashboard" production-data-loss question, flagged above,
remains open.
