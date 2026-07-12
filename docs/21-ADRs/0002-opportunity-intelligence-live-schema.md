---
adr: 0002
title: Opportunity Intelligence — Adopt Live Scraper Schema as Canonical
status: Accepted
date: 2026-07-12
amends: ../07-Grant-Studio/Grant-Studio-Specification-v1.0.md §2, ../../00-EAS-v1.0.md §4 (Call/Opportunity), §8
---

# ADR-0002: Opportunity Intelligence — Adopt Live Scraper Schema as Canonical

## Context

Grant Studio's Opportunity Intelligence module was originally specified by
adopting the Civil Society Funding Monitor (CSFM) PRD's `opportunity` entity
wholesale. That PRD was written as a forward-looking product requirements
document and its schema was treated as the target state.

A real, current export from the AI Grants Scraper (`funding-dashboard-v5.html`,
an 8 June 2026 scrape session, 40 opportunities across four thematic clusters
including a newly added `eu_inst` cluster) shows the scraper already produces
several fields the CSFM PRD does not define: a per-opportunity strategic
action narrative (`strat`), a risk score (`risk`), per-tag confidence scores
(`tc`) rather than one aggregate relevance score, change-tracked versioning
(`version`), and reviewer flags (`flags[]`). The CSFM schema is not wrong, but
it is not what is actually running, and specifying against an assumed schema
when a real one exists and is richer would mean rebuilding capability that
already works.

## Decision

The live scraper schema (documented in Grant Studio spec §2.1) is adopted as
canonical for the `Opportunity`/`Call` entity's extended fields. The CSFM PRD
remains the source of truth for infrastructure the scraper does not yet
implement itself: source registry, crawl scheduling, dashboard information
architecture, and notification dispatch (CSFM PRD §3, §6, §7).

Two specific extensions to the EAS §4 domain model follow from this:

1. `Opportunity` gains `strat` (strategic narrative), `risk`, per-tag `tc`,
   `flags[]`, and `version` as first-class fields.
2. `strat` is explicitly labelled AI-generated guidance requiring Research
   Ministry review before being presented as a recommendation, not treated as
   an autonomous verdict — consistent with EAS §7.2 (human oversight is
   structural). The standalone artifact's current phrasing (e.g. "act today")
   reads as an instruction; the platform version must not.

## Consequences

- Grant Studio's Eligibility Engine (§3) and Compliance Studio (§8) must treat
  `strat` and `risk` as inputs to a human-reviewed recommendation, not as
  outputs they can pass through unchanged.
- The Donor entity is confirmed against the real donor pipeline
  (`20250904_Donor-Pipeline_Integrated.xlsx`) rather than an assumed field
  list, adding a `DFF_Position` pipeline-stage field distinct from
  `Donor_Status`, and a `relationship_owner` reference — see Grant Studio §2.3
  and EAS §4.
- Future scrape sessions (v6, v7, ...) should be diffed against this ADR's
  schema baseline when `docs/05-Regulatory-Knowledge-Layer/` and
  `docs/06-Knowledge-Platform/` ingestion pipelines are specified, since the
  scraper's schema has already changed once (v4 → v5 added the `eu_inst`
  cluster) and should be expected to keep evolving.
