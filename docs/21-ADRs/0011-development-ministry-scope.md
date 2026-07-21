---
document: Architecture Decision Record
id: ADR-0011
title: Development Ministry — Proposed Minimal Data Contract
status: PROPOSED — awaiting Product Owner review, not yet implemented
owner: Vas (Product Owner)
architect: Claude (Chief Systems Architect, Claude Cowork)
implementer: Claude Code (Lead Developer) — implements only once status: APPROVED
relates_to: EAS v1.0 §3.2 (Cabinet / Ministry Library), Parliament Core Specification §0
---

# ADR-0011 — Development Ministry — Proposed Minimal Data Contract

## 1. Context

EAS §3.2 lists the Development Ministry as one of the 9 v1 core ministries:
> "Development (organisational policy, capacity building, training — continuous)"

That single line is the entirety of its specification anywhere in `docs/` or
`00-EAS-v1.0.md`. Unlike every other ministry (Fundraising, Finance &
Administration, Procurement now implemented alongside this ADR; Research,
Writing, M&E, Compliance, Reporting implemented earlier), Development has:

- No `ai_agents` slug reserved anywhere.
- No named table, column, or entity in `docs/11-Database-Schema/` it reads
  or writes.
- No module description in any detail spec (`docs/07-Grant-Studio/`,
  `docs/08-Project-Operations/`) — it is absent from both, unlike every
  other ministry which appears in at least one module ownership table.
- No API surface in `docs/12-APIs/`.

Per this repository's own governing rule (`CLAUDE.md`: "if a spec is
ambiguous, silent, or still Draft, the correct move is to ask or raise an
ADR — not to invent behaviour"), writing a Ministry Adapter for Development
now would mean fabricating its prompt content, its data contract, and its
invoking edge function with nothing in the spec set to ground any of it —
qualitatively different from the other three ministries closed alongside
this ADR, each of which had at least one concrete, named deliverable
(Opportunity Intelligence for Fundraising; Budget Studio for Finance &
Administration; subcontract/vendor-selection rationale for Procurement) to
implement against.

## 2. Decision

**Development Ministry is deferred, not implemented.** This ADR proposes a
minimal contract for Product Owner sign-off; no code exists for it yet.

Proposed minimal contract, for review:

- **Agent slug:** `development_ministry`.
- **Scope:** drafts organisational policy/capacity-building guidance —
  e.g., a training-needs summary or policy-gap note for a named
  organisational unit — read-only against Knowledge Hub content (per EAS
  §3.1's mapping of Development to the "continuous track... consuming
  Knowledge Platform + institutional Memory Engine," `00-EAS-v1.0.md:190`).
  No write target is proposed yet — output would be advisory text returned
  to the caller and logged to `audit_events`, matching the pattern this
  session established for Procurement (`procurement-decision-draft-run`):
  draft-only, no autonomous write.
- **No new table.** Reads `knowledge_documents`/`knowledge_chunks`
  (Knowledge Hub, already implemented) and `memory_entries` (institutional
  tier, already implemented). No schema change proposed.
- **Invoking function:** a new `development-guidance-draft-run` edge
  function, mirroring `procurement-decision-draft-run`'s shape.

## 3. Open Question for the Product Owner

Is "capacity building, training" meant to produce guidance *for staff of
the CSO/NGO using this platform* (the contract above), or guidance *for
beneficiaries of the CSO/NGO's programmes* (a materially different data
contract — closer to Project Operations' M&E/Reporting ministries than to
an internal Knowledge Hub consumer)? EAS §3.1's continuous-track mapping
reads as the former, but this is inferred, not stated — confirm before
this ADR is approved.

## 4. Status

Not implemented. Revisit once the Product Owner confirms or amends §2 above.
