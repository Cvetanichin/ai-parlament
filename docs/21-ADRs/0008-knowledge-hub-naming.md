---
adr: 0008
title: Rename the Internal Research/Knowledge Application to "Knowledge Hub"
status: Accepted
date: 2026-07-12
amends: ../../00-EAS-v1.0.md §3.1, §5, ../09-Knowledge-Hub/Knowledge-Hub-Specification-v1.0.md
---

# ADR-0008: Rename the Internal Research/Knowledge Application to "Knowledge Hub"

## Context

EAS §3.1 and §5 name a Layer 1 application "Intelligence Workspace /
Knowledge Hub" — an internal, cross-project research and
institutional-memory surface. Separately, EAS §8's existing-asset map
re-platforms the organisation's *existing* SaaS product, also literally
named "Intelligence Workspace" (`cvetanichin.org`), into **Project
Operations** (`docs/08-Project-Operations/`), the post-award delivery and
monitoring workspace.

This is a real naming collision, not a cosmetic one: two structurally
different applications — one internal research/knowledge tool, one
external-facing project delivery workspace — would otherwise share the name
"Intelligence Workspace" in product-facing contexts (navigation, donor-facing
references, internal documentation), risking confusion for both staff and
anyone outside the organisation who has prior familiarity with the existing
SaaS product's name.

`docs/09-Intelligence-Workspace/`'s spec (now `docs/09-Knowledge-Hub/`)
flagged this at spec time and recommended a rename but did not resolve it
unilaterally, since naming/brand decisions belong to the Product Owner
(`docs/01-Product-Vision/` §3's same principle). The Product Owner has now
asked for this resolved as a condition of approving that spec.

## Decision

The internal research/knowledge application (formerly "Intelligence
Workspace / Knowledge Hub") is renamed **Knowledge Hub**, full stop. The
name "Intelligence Workspace" is retired from this application entirely and
now refers exclusively to the existing SaaS product being re-platformed
into Project Operations (`docs/08-`).

Concretely:

- `docs/09-Intelligence-Workspace/` is renamed `docs/09-Knowledge-Hub/`;
  its spec file is renamed `Knowledge-Hub-Specification-v1.0.md`.
- EAS §3.1's Layer 1 application list and §5's application-to-service
  routing table both amend "Intelligence Workspace / Knowledge Hub" to
  "Knowledge Hub."
- No functional, data-model, or API change accompanies this — it is a
  naming-only amendment. Every module, data contract, and API surface
  already specified in `docs/09-` (now `docs/09-Knowledge-Hub/`) §1–§4 is
  unchanged.

## Consequences

- Two different products no longer share a name anywhere in the platform's
  documentation or (once built) its UI navigation.
- `docs/01-Product-Vision/` §7's naming-collision open item is closed by
  this ADR; that spec should be updated to reflect the resolution, not left
  citing a still-open item.
- `docs/20-Roadmap/` §7's Phase 5 entry, which named "Intelligence
  Workspace / Knowledge Hub," should be updated to "Knowledge Hub" for
  consistency — a documentation follow-up, not a re-sequencing.
- This is the first amendment to the EAS document itself since v1.0's
  approval (every prior ADR amended a detail spec or resolved an EAS §14
  open item without changing EAS's own running text) — precedent for how
  future EAS text amendments should be handled: an ADR first, then a small,
  clearly-scoped edit to the EAS section named in `amends` above, not a
  silent rewrite.
