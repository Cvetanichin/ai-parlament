---
document: Architecture Decision Record
id: ADR-0009
title: Governance Layer Cutover — Shadow Run Strategy
status: APPROVED — approved by Product Owner (Phase C.6 sequencing confirmed: compliance-agent first, one ministry at a time)
owner: Vas (Product Owner)
architect: Claude (Chief Systems Architect, Claude Cowork)
implementer: Claude Code (Lead Developer) — implements only once status: APPROVED
supersedes: none
relates_to: EAS v1.0 §3.2, §3.3, §9; docs/03-Parliament-Core/; docs/20-Roadmap/ Phase 2
---

# ADR-0009 — Governance Layer Cutover: Shadow Run Strategy

## 1. Context

Production (`Consultancy Dashboard`, `jorpfsrvhnelnboupiyx`) runs three live, working ministries — `me-agent`, `compliance-agent`, `reporting-agent` — producing real donor-facing content (confirmed: 6 real agent runs against one real project, "HERA VOL 2"). None of them sit behind a Workflow Engine, a Tripartite Veto Engine, or a Human Gate. This is the platform's own risk register's "High" liability item, live and unmitigated, today.

Staging (`cso-playground`, `urhocsijfzkepebsmstx`) has a validated governance mechanism — `workflow-governance-run`, `workflow-research-run`, `workflow-gate-decide`, a seeded `workflow_definitions` row ("Governance Loop", vote-of-no-confidence threshold 2) — with zero security lints, but zero real invocations. It has never touched real content.

Four cutover strategies were presented (wrap-in-place, full re-platform, shadow run, new-ministries-first). **Decision: shadow run.**

## 2. Decision

The governance mechanism is promoted to production **in observe-only mode**. Every real invocation of `me-agent`, `compliance-agent`, and `reporting-agent` continues to serve its live response completely unchanged. In parallel, an asynchronous, non-blocking hook submits the same input/output pair to the governance pipeline, which runs the full Tripartite Veto Engine and records a verdict — but that verdict has no power to alter, delay, or block what the user already received.

This produces real veto-catch-rate data (one of the five confirmed Product Vision v1.2 success metrics) before the mechanism is ever load-bearing, with zero regression risk to a system already producing real donor content.

## 3. Non-Negotiable Constraint

**A defect in the governance pipeline must never be able to degrade or break a live agent response.** This is the entire reason shadow mode exists rather than a direct cutover. Any implementation that makes the live response path wait on, depend on, or be modified by the shadow pipeline's outcome violates this ADR and must be rejected in review.

## 4. Phases

### Phase C.1 — Promote Governance Schema to Production
- Apply the equivalent of staging's `11_phase1_seed` migration to production: inserts the `workflow_definitions` "Governance Loop" row and any supporting reference rows.
- Additive only. Touches no existing tenant-scoped table. Follows ADR-0007's mandatory staging-validation discipline — already satisfied, since this exact migration has been running cleanly in staging.
- Exit check: `workflow_definitions` in production has 1 row, identical shape to staging's.

### Phase C.2 — Deploy Governance Edge Functions in Shadow Mode
- Deploy `workflow-research-run`, `workflow-governance-run`, `workflow-gate-decide` to production.
- Every deployment carries an explicit mode flag — `GOVERNANCE_MODE=shadow` — read at invocation time. In `shadow` mode the pipeline runs to completion and writes its verdict, but returns nothing to any caller that would act on it, and nothing in `me-agent`/`compliance-agent`/`reporting-agent`'s code changes.
- `GOVERNANCE_MODE=enforced` is defined now but not activated until Phase C.6.

### Phase C.3 — Wire the Shadow Invocation
- After each of the three live agents writes its normal `agent_runs` row (unchanged behaviour), a fire-and-forget async call submits that run's `input_data`/`output_data` to `workflow-governance-run`.
- Preferred mechanism: a Postgres trigger on `agent_runs` INSERT (`source = 'production'`) invoking the edge function via `pg_net`, or a Supabase Database Webhook — either way, decoupled from the request/response cycle that serves the user.
- Verdict lands in `workflow_instances` (new row, `state` progressing per the existing state machine) plus `audit_events`, tagged so shadow verdicts are unambiguously distinguishable from any future enforced-mode verdict. **Open question for Claude Code to raise, not decide:** exact tagging mechanism (a `workflow_instances.mode` column, or reuse of an existing field) — propose one against `docs/11-Database-Schema/` conventions rather than inventing ad hoc.
- No user-facing surface changes in this phase.

### Phase C.4 — Observation Window
- Run in shadow across a minimum of 20–30 real agent invocations, or 4–6 weeks, whichever comes first — enough volume for the catch-rate numbers to mean something.
- Track three numbers, all already derivable from existing tables:
  - **Veto catch rate** — share of shadow runs where the Tripartite Veto Engine would have failed the output.
  - **Plausibility of catches** — spot-check a sample of flagged runs yourself; is the veto engine catching real problems or noise?
  - **Shadow-pipeline cost/latency overhead** — token cost and runtime of the parallel governance calls, tracked the same way `agent_runs.token_cost`/`latency_ms` already track the live agents.

### Phase C.5 — Exit Criteria (Product Owner Sign-Off Required)
Before any cutover to enforced mode, all of the following must hold — this is a decision gate, not an automatic transition:
- Veto catch rate is non-zero and, on manual review, catches look like real problems rather than false positives at an unacceptable rate.
- No shadow-pipeline failure or timeout has ever affected a live response (verified from logs, not assumed from design).
- You (Product Owner) have reviewed the sample of flagged runs and are satisfied the semantic veto's judgment is trustworthy enough to gate real submissions.

### Phase C.6 — Cutover to Enforced Mode
- Flip `GOVERNANCE_MODE=enforced`. From this point, agent output must pass the Vote of No Confidence loop and reach the applicable Human Gate before being marked deliverable.
- **Confirmed (Product Owner approval): one ministry at a time, `compliance-agent` first**, not all three simultaneously. This keeps blast radius small if enforced mode surfaces a problem shadow mode didn't. `reporting-agent` and `me-agent` follow in an order to be set once `compliance-agent`'s enforced-mode data is in — not pre-committed now.
- Full re-platforming onto the Ministry Adapter contract and Prompt Registry (the elements of Option B) can be folded in incrementally per ministry after its enforced cutover, not as a precondition for it.

## 5. Rollback

Shadow mode (Phases C.1–C.5) is trivially reversible at any point — disable the trigger/webhook, or set `GOVERNANCE_MODE` to a no-op; the live agents were never modified and never depended on it.

After Phase C.6, `GOVERNANCE_MODE` remains a live, immediately-settable flag per ministry — enforced mode must be revertible to shadow-only in production without a deploy, in case the governance layer misbehaves under real load after cutover.

## 6. Explicitly Out of Scope for This ADR
- Re-platforming `me-agent`/`compliance-agent`/`reporting-agent` onto the Ministry Adapter contract — separate, later decision per ministry.
- The remaining six ministries not yet built (Fundraising, Research beyond eligibility, Writing, M&E, Finance & Admin, Procurement, Development) — build order for those is a Roadmap Phase 3+ question, not this ADR.
- `websocket-server` removal — unrelated scaffold function, flagged for removal in the same implementation pass as a housekeeping item, not part of the governance mechanism.

## 7. Immediate Next Action
Claude Code implements Phase C.1 only, against a staging branch first per ADR-0007, and stops for review before Phase C.2 — each phase gate in §4 is a checkpoint, not a single implementation ticket.

## 8. Status as of 18 Jul 2026

**Phase C.1 complete**, applied to production (`jorpfsrvhnelnboupiyx`) with explicit Product Owner go-ahead, after ADR-0010 Tasks 1–3 were confirmed done (the `regulatory_clauses` backfill's `OPENAI_API_KEY` billing issue was resolved and the backfill completed: 75/75, 0 failures).

Applied `11_phase1_seed` (already staging-validated per ADR-0007, unchanged) to production via `apply_migration`. Verified before applying: production's existing `ai_agents` rows (`compliance-agent`, `me-agent`, `reporting-agent`, the live SaaS app's agents) use hyphenated slugs with zero collision against this migration's underscore-separated ministry slugs (`research_ministry`, `writing_ministry`, `compliance_judge`) — the `on conflict (slug) do nothing` guard was never actually exercised.

Exit check (§4): `workflow_definitions` in production has exactly 1 row, verified byte-for-byte identical to staging's (`states`, `transitions`, `gates`, `vote_of_no_confidence_threshold = 2`). The three ministry agents and their `prompt_modules` rows (`status = 'active'`, `approval_state = 'approved'`) are present and correctly linked.

Per §7, stopping here for review — Phase C.2 (deploying the governance edge functions to production in shadow mode) is not started.
