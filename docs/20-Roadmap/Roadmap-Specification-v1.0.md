---
document: Development Roadmap Specification
version: 1.0
status: APPROVED — approved by Product Owner 12 July 2026; supersedes the phase table in Parliamentary_AI_Engine_Roadmap.md (historical, retained as background context only)
parent: ../../00-EAS-v1.0.md (EAS §13 Immediate Next Specifications)
---

# Roadmap — Specification v1.0

## 0. Purpose and What This Supersedes

The historical `Parliamentary_AI_Engine_Roadmap.md` phase table is no
longer the authoritative build sequence — this document is, per the
top-level `README.md`'s standing note. The historical document's budget/risk
data and Phase 0–1 background remain valid reference material; its phase
*ordering* does not, because it predates every spec now Approved. This
document sequences build work against what is **actually specified and
Approved today**, not a plan made before the architecture existed.

## 1. What's Approved and Buildable Now

Every spec below is Approved as of 12 July 2026: EAS v1.0, `docs/03-
Parliament-Core/`, `docs/04-Platform-Services/`, `docs/05-Regulatory-
Knowledge-Layer/`, `docs/06-Knowledge-Platform/`, `docs/07-Grant-Studio/`
(all modules), `docs/08-Project-Operations/`, `docs/10-House-of-
Parliament/`, `docs/11-Database-Schema/` (v1.4), `docs/16-Security/`,
`docs/19-Deployment/`. This is the full governance and Grant Studio
product surface — nothing is blocked on a missing spec at this point,
only on build sequencing and Product Owner review of the specs written
this session (`01-`, `02-`, `09-`, `12-`, `13-`, `14-`, `17-`, `18-`, `20-`
— this document included).

## 2. Phase 0 — Foundation

**Goal:** the platform's schema and identity layer exist, staging-validated,
with zero functional change to production yet.

- Database Schema §1 (multi-tenancy migration: `organisations`,
  `organisation_members`, backfill).
- Database Schema §2 follow-ons: `profiles.is_platform_operator`,
  `organisation_members.role` CHECK constraint (Security spec §2).
- Deployment spec's staging discipline (already provisioned, `docs/19-`) —
  every migration below runs through it, not just this phase's.
- **Depends on:** nothing else. **Blocks:** every subsequent phase, since
  every later table carries `organisation_id`.

## 3. Phase 1 — Governance Layer, Grounded in Real Code

**Goal:** Workflow Engine and Agent Runtime exist as platform services;
Research and Writing ministries (the two with real precedent, Parliament
Core §0) are re-platformed first, proving the pattern before the other
seven ministries are built from scratch on top of it.

- Parliament Core §2 (Workflow Engine), §3 (Agent Runtime) — physically
  extending `ai_agents`/`prompt_modules`/`agent_runs` (ADR-0007).
- Re-platform `pmAgent.js`'s governance loop as a Workflow Definition
  (Parliament Core §2.8) — Research and Writing ministries only.
- Regulatory Knowledge Layer §4 (ingestion pipeline) — needed before
  Compliance Studio (Phase 2) can call real Compliance APIs instead of
  `vetoEngine.js`'s inline rule logic.
- Platform Services §2 (Prompt Registry) — the four hardcoded prompts in
  the real edge functions (Project Operations spec §6) migrate here.
- **Depends on:** Phase 0. **Does not yet include:** the other seven
  ministries (Finance & Administration, Compliance, M&E, Reporting,
  Procurement, Fundraising beyond the scraper artifact, Development) —
  those are net-new and belong to Phase 2, sequenced with the Grant Studio
  modules that actually need them.

## 4. Phase 2 — Grant Studio Full Pre-Award Lifecycle

**Goal:** the complete pre-award product surface, module by module, each
bringing its owning ministry online as needed rather than standing up all
seven remaining ministries speculatively upfront.

Sequenced by dependency, not by spec section number:

1. **Eligibility Engine** (Grant Studio §3) — brings Research's Eligibility
   API usage online; blocks Human Gate 2.
2. **Consortium Builder pre-award** (§4.1) — Research + Compliance
   Committee; Compliance ministry comes online here.
3. **Proposal Builder** (§5) — Writing ministry, already re-platformed in
   Phase 1, extended with the section-per-Workflow-Definition pattern.
4. **Logframe Studio** (§6) — M&E ministry comes online.
5. **Budget Studio** (§7) — Finance & Administration ministry comes online.
6. **Compliance Studio** (§8) — the full specialised-validator set, now that
   every artefact type it validates (proposal, budget, logframe, partner)
   exists.
7. **Submission Gateway** (§10) — last, since it depends on every module
   above being complete for a given Proposal.

Reporting Studio (§9) is **not** in this phase — it is post-award and moves
to Phase 3 alongside Project Operations, since it needs a real `Project`
(post-award) to report against, and shares infrastructure with Project
Operations' existing `reporting-agent` edge function.

- **Depends on:** Phase 1 (Workflow Engine, Agent Runtime, Regulatory
  Knowledge Layer, Prompt Registry all live).

## 5. Phase 3 — Post-Award: Project Operations + Reporting

**Goal:** the award-to-close lifecycle, building on Project Operations'
already-approved spec (grounded in the real, live Intelligence Workspace
codebase) rather than new-build.

- Project Operations §1–§7 (already Approved, zero open items) — the
  `me-agent`/`compliance-agent`/`reporting-agent` edge functions gain the
  governance layer (Workflow Engine, human gates) they currently lack.
- Consortium Builder post-award (Grant Studio §4.2, §4.3) — the joint
  Partner Management Committee (Procurement, Finance & Administration,
  Compliance, M&E) — Procurement ministry comes online here, the last of
  the nine.
- Reporting Studio (Grant Studio §9).
- **Depends on:** Phase 2 (all pre-award ministries exist; Partner entity
  already built pre-award, reused not rebuilt).

## 6. Phase 4 — Operator Tooling and Security Hardening

**Goal:** House of Parliament and Security's access-control model go live,
closing the governance loop on the platform's own internals (who can
promote a prompt, who can curate institutional memory).

- House of Parliament — all 14 modules (`docs/10-`), though Prompt IDE and
  Playground have effectively existed in embryo since Phase 1 (Prompt
  Registry, mock Agent Versions) and can be prioritised earlier within this
  phase if useful during Phase 1–3 development itself.
- Security spec's full rollout: MFA for `is_platform_operator` accounts,
  Supabase Vault for notification secrets, the PII pre-prompt filter (§4 of
  that spec) — this last item should not wait until Phase 4 if beneficiary
  PII is already flowing through Knowledge Platform ingestion in Phase 1;
  flagged as a **sequencing risk**, not deferred casually (see §8).

## 7. Phase 5 — Knowledge Hub and Full AI Governance Instrumentation

**Goal:** the "soft" institutional-memory and governance-visibility layer
that makes the platform durable past any one person, not just functional
day-to-day.

- Knowledge Hub (`docs/09-Knowledge-Hub/`) — naming collision with
  Project Operations resolved by ADR-0008.
- AI Governance's Observability & Cost Service and AI App Register
  (`docs/17-`) — cost/confidence dashboards and register entries populate
  from data that's been accumulating since Phase 1's Agent Invocations, so
  this phase is largely "build the dashboard over data that already
  exists," not new instrumentation.
- Executive Dashboard (Frontend spec §5).

## 8. Sequencing Risks Worth Flagging Now

- **PII filter timing (§6):** the Regulatory Knowledge Layer and Knowledge
  Platform ingestion pipelines go live in Phase 1, but the PII pre-prompt
  filter (Security spec §4) is sequenced into Phase 4 by ministry-tooling
  grouping. If real beneficiary-referencing documents are ingested before
  the filter exists, that's a real exposure window, not a paperwork gap.
  **Recommendation:** pull the ingestion-side PII filter (Security §4.2,
  point 1 — the Knowledge Platform stage) into Phase 1 alongside the
  ingestion pipeline itself, even though the rest of Security waits for
  Phase 4. This is a recommendation for Product Owner sequencing decision,
  not a unilateral change to the phase list above.
- **Nine-ministry buildout is spread across three phases (1–3) by design**
  — this avoids building Finance & Administration, M&E, Compliance,
  Procurement, and Reporting ministries speculatively before a Grant
  Studio module actually needs them, but means "how many ministries exist"
  is not a fixed milestone, it's a running count that only completes at
  the end of Phase 3.

## 9. Explicitly Not Scheduled

Per Product Vision §2/§5 and EAS §8.4: multi-org SaaS tenancy expansion and
the labor-market/career product line are not in any phase above — they are
out of v1 scope entirely, not deferred to a "Phase 6."

## 10. Open Items for Product Owner

- **This document sets ordering and dependency logic, not calendar dates
  or sprint counts** — those require team-capacity input this document
  does not have and should not fabricate.
- **PII filter sequencing** (§8) — recommend pulling into Phase 1; final
  call is the Product Owner's.
- Whether House of Parliament's earlier-usable modules (Prompt IDE,
  Playground) should formally start in Phase 1 rather than Phase 4, given
  they're useful the moment Prompt Registry and Agent Runtime exist — a
  scheduling nuance, not a spec dependency issue (nothing blocks it either
  way).
