---
document: Product Vision Specification
version: 1.0
status: APPROVED — approved by Product Owner 12 July 2026; §3 (product brand naming) and §6 (exact success-metric targets) remain non-blocking open items for later decision; the docs/09- naming collision this spec originally flagged in §7 is resolved by ADR-0008
parent: ../../00-EAS-v1.0.md (EAS §1 What This Platform Is)
---

# Product Vision — Specification v1.0

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

## 3. Naming and Identity — Open Item, Not Decided Here

"Parliamentary AI Ecosystem" is the **architecture's** internal name — it
describes the governance mechanism (Prime Minister, Ministries, Voting),
not necessarily the name a donor, board member, or CSO client should ever
see. Whether the product-facing brand is the same name, a different name
entirely, or whether "Parliamentary AI" stays an internal/technical term
while a separate brand fronts the applications (Grant Studio, Project
Operations, etc. already read as product names in their own right) is a
**business decision for the Product Owner, not an architectural one** — this
document does not resolve it and no other spec should invent product-facing
copy or a brand name in its absence (per the existing `01-` stub's
instruction, carried forward).

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
build-verification criteria and are not restated here. This section is
about **product** success once the platform is in real use, at a
directional level; exact numeric targets are a Product Owner call this
document does not set unilaterally:

- **Compliance defect rate**: fewer eligibility/compliance issues caught
  late (at Polish Gate or by a donor) versus caught early (Eligibility
  Engine, continuous Compliance Studio) — direction, not a fixed number.
- **Proposal cycle time**: time from Opportunity identification to
  Submission-ready, tracked per proposal via Workflow Instance timestamps
  (Parliament Core §2.6) already captured by construction, not a new metric
  to instrument.
- **Institutional knowledge reuse**: Knowledge Platform / institutional
  memory queries that actually surface a past proposal or lesson-learned
  during drafting, versus drafting from scratch each time.
- **Win rate**: directionally relevant but confounded by too many
  non-platform factors (donor priorities, competition) to be a primary
  platform-attributable metric — track it, don't over-index on it as proof
  of platform value.

## 7. Open Items for Product Owner

- **Product-facing brand name(s)** (§3) — not decided here.
- **Exact numeric success targets** (§6) — directional framing only; targets
  need Product Owner input once there's a baseline period of real usage to
  measure against.
- ~~**Naming collision between `docs/09-` and `docs/08-`**~~ — **resolved**,
  ADR-0008: the new application is named Knowledge Hub; "Intelligence
  Workspace" now refers exclusively to the existing SaaS product
  re-platformed into `docs/08-Project-Operations/`.
