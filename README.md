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

`Parliamentary_AI_Engine_Roadmap.md` (the original MVP planning document) is not
deleted or wrong — it's superseded as the architecture authority and kept as
historical context for Phase 0–1 decisions and budget/risk data that's still
accurate. The EAS is what governs structure now; the roadmap's phase table is
explicitly superseded by `docs/20-Roadmap/` once that's written.

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

**All nine remaining `not yet specified` areas now have a first full spec**,
all `DRAFT — pending Product Owner approval` (not pre-approved, unlike
Parliament Core, since these introduce genuinely new content rather than
confirming already-decided architecture):

| Spec | Notable content |
|---|---|
| `docs/01-Product-Vision/` | Problem statement, persona value props, explicit non-goals; deliberately does **not** decide product-facing naming or exact success-metric targets — flagged as your calls, not architecture's |
| `docs/02-Domain-Model/` | Full ER diagram (Mermaid) + entity dictionary consolidating six specs' worth of scattered entity definitions; introduces zero new entities |
| `docs/09-Intelligence-Workspace/` | Flags a real naming collision: this new "Intelligence Workspace / Knowledge Hub" app is *not* the same as the existing SaaS product (which became `docs/08-Project-Operations/`) — recommends a rename before launch |
| `docs/12-APIs/` | Gateway cross-cutting contract (versioning, auth, error shape, rate limiting) + a routing index to every endpoint's real owning spec — no contracts re-derived |
| `docs/13-Frontend/` | One React shell across all four Layer-1 apps (not four deployments), a reusable Human Gate UI component, and the direct-Supabase-vs-Gateway data-fetching rule |
| `docs/14-Backend/` | **Revises** the historical roadmap's Node+Python split: Node/Deno (Supabase Edge Functions) is primary; Python is scoped narrowly to document ingestion only |
| `docs/17-AI-Governance/` | AI App Register, human oversight matrix, EU AI Act obligation-to-logging mapping, incident playbook — and the confirmed home of the Observability & Cost Service |
| `docs/18-Testing/` | Priority-ordered test pyramid; Veto Engine regression suite's first two golden-file cases pulled directly from real `vetoEngine.js` fallback logic |
| `docs/20-Roadmap/` | Six-phase build sequence by actual dependency; flags one real sequencing risk (the PII filter lands in Phase 4 but PII-bearing ingestion starts in Phase 1) |

**The full `docs/` skeleton now has a first spec everywhere** except
nothing — every folder that was `not yet specified` now has content. What
remains is Product Owner review of this round's nine drafts, plus
implementation of everything already Approved.
currently approved *specification*, not yet applied schema. `reports_
report_type_check` (§15.3) specifically touches a real, live table and its
exact current constraint name/values were not verified against the live
database this session — confirm before applying.

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

Every migration touching a real, live table (§1, §3, §5 of the Database
Schema spec) is now a hard requirement to validate on a Supabase branch or
cloned staging project before promotion — this is ADR-0007's mitigation,
not optional discipline, and it applies before the first Parliament Core
migration is written.

**Still flagged:** the Parliament Core spec's migration sections describe the
target contract for `pmAgent.js` / `ministryAdapter.js` based on the repo's
README, not the actual current source — raw GitHub reads returned empty
repeatedly this session; Claude Code should diff against the real code before
implementing. **Minor flag, not architecturally significant:** the
Intelligence Workspace repo's own `CLAUDE.md` says Stripe; the actual code
runs Paddle — worth a doc fix whenever convenient.
