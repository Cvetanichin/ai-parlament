---
adr: 0003
title: Vote of No Confidence Threshold — Per-Workflow-Definition, Default 2
status: Accepted
date: 2026-07-12
amends: ../03-Parliament-Core/Parliament-Core-Specification-v1.0.md §2.3.1, ../../00-EAS-v1.0.md §14
---

# ADR-0003: Vote of No Confidence Threshold — Per-Workflow-Definition, Default 2

## Context

EAS §14 left open whether the Vote of No Confidence protocol's failure
threshold (how many consecutive veto failures before escalating to a human
Polish Gate rather than retrying again) should remain a fixed "two consecutive
failures" constant, matching the existing MVP, or become configurable.

## Decision

The threshold is a field on the Workflow Definition
(`voteOfNoConfidenceThreshold`, integer, default `2`), confirmed by the
Product Owner. Every current Workflow Definition inherits the default,
preserving existing MVP behaviour exactly; a future Workflow Definition may
set a different value without a code change.

## Consequences

- No immediate behaviour change — the MVP's two-strikes rule is preserved.
- Workflow Definition authors (initially just Claude Cowork/Claude Code,
  eventually possibly House of Parliament users, `docs/10-`) gain a knob that
  must be used deliberately: a lower threshold for high-stakes donor
  submissions would mean escalating to a human sooner, which trades cost
  savings for reviewer time — this trade-off is not evaluated here and should
  be a per-ministry decision made when each Workflow Definition is authored,
  not a platform default change.
- Closes the last of the four open decisions raised at EAS v1.0 approval that
  was purely architectural; the remaining three (Intelligence Workspace
  integration depth, vector DB choice, multi-tenancy timing) require product/
  infrastructure judgement and stay open.
