---
document: Product Vision Specification
version: 1.1
status: APPROVED — approved by Product Owner 12 July 2026; v1.1 (same day) closes both remaining open items — §3 proposes the brand name "Quorum" (working name, pending sign-off before external use), §6 sets five concrete v1 success-metric targets; the docs/09- naming collision this spec originally flagged is resolved by ADR-0008
parent: ../../00-EAS-v1.0.md (EAS §1 What This Platform Is)
---

# Product Vision — Specification v1.1

## 0. Purpose

EAS §1 states what the platform *is*, architecturally. This document states
*why it exists* and *for whom* — the product framing that should stay stable
even as the architecture underneath it evolves. It does not restate EAS §1;
it answers questions EAS deliberately leaves to the Product Owner: who is
this for, what does success look like, what is this platform explicitly
choosing not to be.

## 1. Problem Statement

A civil society consultancy running EU/UNDP-style grant work today carries
three compounding costs the platform exists to reduce:

- **Compliance risk lives in people's heads.** PRAG, Standard Grant Contract
  conditions, and donor-specific Guidelines for Applicants are read and
  cross-checked manually, per proposal, by whoever happens to be drafting —
  correctness depends on who's available, not on a queryable source of
  truth. This is the failure mode the Regulatory Knowledge Layer (`docs/05-`)
  exists to close.
- **Institutional knowledge doesn't compound.** Past proposals, lessons
  learned, and donor relationship history live in individual memory,
  scattered documents, and chat-tool customisations (a Gemini Gem, a Claude
  project) that can't be queried by the next proposal team the way a shared
  system could. This is what the Knowledge Platform (`docs/06-`) and
  institutional-tier Memory Engine (`docs/04-` §3) exist to close.
- **Tools are fragmented and un-governed.** A grants scraper, a concept-note
  drafter, and a project-monitoring SaaS exist as separate, disconnected
  surfaces with no shared human-oversight mechanism — meaning AI-assisted
  output reaches a donor or board with no structural guarantee a named human
  reviewed it. This is what the four Human Gates (EAS §3.1) and the
  Parliamentary governance layer exist to close.

## 2. Target Segments

**v1 (confirmed, per ADR-0005 and Database Schema §5's Organisation-boundary
decision):** this consultancy, operating as a single Organisation, serving
multiple CSO `clients` as sub-entities of that one tenant. This is the
actual current mode of operation, not a simplification for later — the
platform is built for real use by this team first.

**Later, explicitly not built now:** offering the platform directly to other
consultancies or CSOs as a multi-tenant SaaS product (each becoming its own
`Organisation`) is architecturally supported by the schema (`docs/11-` §1's
multi-tenancy-from-day-one decision) but is a deliberate v1 scope exclusion
— building it now would be speculative complexity against EAS principle 5
(build for the workload that exists). If this segment is ever pursued, it
needs its own product-vision amendment, not a silent scope creep.

**Explicitly excluded, any timeframe, per EAS §8.4:** labor-market/career
tooling (Labor Market Monitor, Career Consultant, HR Assistant) is a
different product line entirely, not an extension of the grant lifecycle
this platform serves.

## 3. Naming and Identity

"Parliamentary AI Ecosystem" remains the **architecture's** internal name —
it describes the governance mechanism (Prime Minister, Ministries, Voting)
and stays exactly as-is in `docs/` and internal engineering conversation.
It is not, and was never meant to be, what a donor, board member, or CSO
client sees.

**Product-facing brand: Quorum.**

A quorum is the minimum number of members whose presence is required before
a body can validly act — which is a precise, non-metaphorical description
of what this platform actually enforces: no proposal, budget, or report
proceeds past a gate without the required review present (EAS §3.1's four
Human Gates; EAS §7.2's named-approver requirement). Unlike "Parliamentary
AI," the name carries no partisan or political connotation, reads as
credible in an EU/UNDP donor-compliance context, and doesn't require
explaining an internal architecture metaphor to someone who will never see
a Ministry or a Prime Minister. It is short, unclaimed by any adjacent
grant-tech product the team is aware of, and scales cleanly as a prefix for
every existing application name without renaming any of them: **Quorum
Grant Studio**, **Quorum Project Operations**, **Quorum Knowledge Hub**,
**Quorum Executive Dashboard**. House of Parliament, being internal-only
tooling (`docs/10-`), does not need a Quorum-branded name at all — it is
never customer-facing.

**Working tagline:** *"Nothing proceeds without quorum."* — doubles as a
literal description of the Human Gate model and a one-line explanation of
why the platform is trustworthy for donor-facing work, without requiring
the reader to know what a Human Gate is.

**This is a proposal, not an irreversible decision.** Brand naming carries
real costs to change once used externally (donor-facing templates, a
website, board materials) — treat "Quorum" as the working name until the
Product Owner explicitly signs off on it appearing in anything external,
the same threshold every other Approved-but-not-yet-implemented spec in
this repository already carries.

## 4. Value Proposition by Persona

| Persona | What changes for them |
|---|---|
| **Proposal writer / consultant** | Drafts against a Context Engine that already knows the call's rules, the organisation's past proposals, and the Logframe/Budget in progress — not a blank page plus manual guideline-reading. |
| **M&E officer** | Indicators, baselines, and Theory of Change live in one place across pre-award (Logframe Studio) and post-award (the same `indicators` table, Grant Studio §6.1) — no re-entry at award. |
| **Finance & Administration** | Budget validated continuously against the Regulatory Knowledge Layer's Budget API, not caught at final review. |
| **Compliance reviewer** | Every AI-asserted compliance claim is a cited rule (EAS §6.3 shape), not a paraphrase to independently re-verify. |
| **Executive / Product Owner** | One Executive Dashboard (`docs/13-`) view of pipeline, deadlines, cost, and compliance posture across every active proposal and project, instead of per-tool status checks. |

## 5. Non-Goals

- **Not a fully autonomous grant-writing bot.** No workflow anywhere in the
  platform can reach a donor without a named human decision at the
  Submission Gate (EAS §9, Liability NFR) — this is a structural constraint,
  not a current limitation to remove later.
- **Not a generic grant marketplace or donor-discovery product for the
  public.** Opportunity Intelligence (Grant Studio §2) serves this
  Organisation's own pipeline, not a public search product.
- **Not a general-purpose knowledge-management tool.** The Knowledge
  Platform and Knowledge Hub (`docs/09-`) are scoped to this organisation's
  grant-lifecycle content — proposals, SOPs, lessons learned, donor
  intelligence — not a general document store.
- **Not a career/labor-market product** (EAS §8.4, restated here because
  it's a product-framing decision, not only an architecture one).

## 6. Success Metrics

The historical `Parliamentary_AI_Engine_Roadmap.md` defines MVP-level exit
criteria (governance loop functions end-to-end, veto engine catches
constraint violations, human gates block correctly) — those remain valid as
build-verification criteria and are not restated here. This section sets
**v1 targets**, each measured against the first full grant cycle after the
relevant Roadmap phase (`docs/20-`) completes, as a working baseline —
explicitly labelled as an initial hypothesis to recalibrate once real usage
data exists, not a number pretending to be more certain than it is:

| Metric | v1 Target | Measured from | Rationale |
|---|---|---|---|
| **Compliance defect rate** | ≥50% reduction in compliance issues first caught at Polish Gate or later (vs. caught earlier by the Eligibility Engine / continuous Compliance Studio), within the first two full proposal cycles after Roadmap Phase 2 | `compliance_findings.status` timestamps against Workflow Instance state (Parliament Core §2.6) — already captured by construction, no new instrumentation | The central bet of the Regulatory Knowledge Layer (`docs/05-`) is catching issues early, cheaply, instead of late, expensively — this is the metric that proves or disproves that bet |
| **Proposal cycle time** | ≥30% reduction in Opportunity-identified → Submission-ready elapsed time, within 6 months of Roadmap Phase 2 completion | Workflow Instance timestamps, per-proposal | Direct measure of the platform's core efficiency claim |
| **Institutional knowledge reuse** | ≥40% of proposals reference at least one Knowledge Platform document or institutional-tier memory entry during drafting, by the time Roadmap Phase 5 (Knowledge Hub) is live | `knowledge_document_links` / `memory_entries` join against `proposal_sections`, both already schema-present (`docs/11-` §5, §11b) | Tests whether institutional memory actually gets used, not just stored |
| **Platform adoption** | 100% of new proposals initiated through Grant Studio (not an ad hoc document or the standalone artifacts it replaced) within 3 months of Roadmap Phase 2 completion | `proposals` row count vs. known opportunity pipeline volume | A platform nobody routes real work through has failed regardless of what its other metrics say — this is the gating metric, checked before the others are trusted |
| **Cost discipline** | ≥80% of Agent Invocations use a cost-efficient model tier; premium models reserved for semantic veto and high-stakes judgement only (EAS §9's tiered-routing NFR) | `agent_runs.token_cost` by `prompt_module.model_name`, aggregated via the Observability & Cost Service (`docs/17-` §1) | Operationalises the NFR that was stated but never given a number to check against |
| **Win rate** | Tracked, not targeted — flagged for investigation if it drops more than 15% from the trailing pre-platform baseline | External, donor-decision data, joined against `proposals` | Confounded by factors outside the platform's control (donor priorities, competition); a hard target here would reward gaming the metric over improving the platform |

These targets apply once the relevant Roadmap phase is live — none are
retroactive, and none block any spec's approval or implementation.

## 7. Open Items for Product Owner

- ~~**Product-facing brand name(s)**~~ (§3) — **proposed**: "Quorum,"
  pending explicit Product Owner sign-off before it appears in anything
  external (donor-facing material, a website, board decks) — a working
  name, not yet a committed one.
- ~~**Exact numeric success targets**~~ (§6) — **set**: five v1 targets,
  each explicitly labelled as an initial hypothesis to recalibrate against
  real usage data once the relevant Roadmap phase is live, not a
  claim of present certainty.
- ~~**Naming collision between `docs/09-` and `docs/08-`**~~ — **resolved**,
  ADR-0008: the new application is named Knowledge Hub; "Intelligence
  Workspace" now refers exclusively to the existing SaaS product
  re-platformed into `docs/08-Project-Operations/`.
