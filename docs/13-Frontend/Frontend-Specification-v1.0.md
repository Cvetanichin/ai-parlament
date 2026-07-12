---
document: Frontend Specification
version: 1.0
status: APPROVED — approved by Product Owner 12 July 2026
parent: ../../00-EAS-v1.0.md (EAS §3.1 Layer 1 applications, §11 repo restructuring)
related_specs: ../10-House-of-Parliament/House-of-Parliament-Specification-v1.0.md, ../16-Security/Security-Specification-v1.0.md, ../12-APIs/APIs-Specification-v1.0.md
---

# Frontend — Specification v1.0

## 0. Scope and Boundary

Production UI for Grant Studio, Project Operations, Intelligence
Workspace/Knowledge Hub, and the Executive Dashboard. **Explicitly not
House of Parliament** (`docs/10-`, already fully specified and Approved,
internal operator tool) — the current MVP's `frontend/index.html` playground
is retained as House of Parliament's seed (EAS §11) and is **not** the
starting point for this production frontend, which is new build.

## 1. Information Architecture

**One React shell application, not four separately deployed frontends.**
Grant Studio, Project Operations, Intelligence Workspace/Knowledge Hub, and
the Executive Dashboard are top-level navigation sections within a single
authenticated shell, sharing auth session, design system, and the reusable
components in §4 — not independent deployments. Rationale: these
applications share the same user base (the consultancy's own staff) and
the same underlying data model (`docs/02-Domain-Model/`); splitting them
into separate deployments would duplicate auth, navigation, and the Human
Gate UI component (§4) for no isolation benefit, since they are not
separately sold or separately tenanted (Product Vision §2's single-
Organisation-at-v1 framing).

Navigation is role-gated: a `viewer`-role user (Security spec §2.1) sees
read-only views of the same sections an `owner` sees, not a different
navigation structure — consistent visibility, differentiated interaction.

## 2. Data-Fetching Pattern

Two call paths, chosen per read/write shape, not per application:

- **Direct Supabase client SDK calls** where RLS alone is sufficient to
  enforce the access rule — most reads (a proposal's own sections, a
  project's own indicators) fall here, since RLS already scopes correctly
  and a Gateway round-trip would add latency for no additional check.
- **API Gateway calls** (`docs/12-APIs/`) for anything that orchestrates
  across services or enforces a business rule beyond row-level access — 
  starting a Workflow Instance, a Human Gate decision, any Compliance
  Engine query, any write gated by `is_platform_operator` or role beyond
  simple RLS.

This boundary is the same principle Parliament Core §4 already states for
Layer 1-to-Layer 2/3 calls, applied concretely to frontend implementation:
if RLS alone answers "can this user see this row," go direct; if a
workflow, gate, or cross-service rule is involved, go through the Gateway.

## 3. Component Architecture

Structural requirements, not visual design (deferred to implementation):

- A shared **design system** (component library, spacing/type scale) used
  across all four sections — implementation detail (library choice) is an
  open item (§8), not decided here.
- **Role-gated navigation and action visibility** driven by
  `organisation_members.role` and `is_platform_operator`, read once at
  session start and cached client-side, re-validated server-side on every
  gated action (never trust the client-side gate alone — Security spec §2
  principle).

## 4. Human Gate UI Pattern (Reusable Component)

The four Human Gates plus Compliance Override recur across Grant Studio and
Project Operations (Reporting Studio's gates, Submission Gateway's gate).
One reusable component, not four bespoke implementations: renders the
artefact under review, the relevant Compliance Findings / Eligibility
Report / Veto verdict feeding the decision, an approve/reject action with a
required `note` field on rejection, and — for Compliance Override
specifically — a required `justification` field (Grant Studio §8.1,
Security §2.2's `owner`/`admin`-only gate). This component is the frontend
expression of Parliament Core §2.4's Gate Request record — it renders
whatever that record contains, it does not independently decide what a
gate needs to show.

## 5. Executive Dashboard

Cross-application, read-only aggregation: pipeline status (Opportunities →
Proposals → Projects, by stage), upcoming deadlines (Opportunity deadlines,
report due dates), cost (Observability & Cost Service, `docs/17-`), and
compliance posture (aggregated `compliance_findings` status across active
Proposals/Projects, same aggregation Grant Studio §8.1's `GET /compliance/
status` already computes per-proposal, rolled up here across all of them).
No write actions originate from this section — it is a routing surface to
the relevant application, not a parallel editing interface.

## 6. Accessibility and Internationalisation Baseline

WCAG 2.1 AA as the baseline target (standard for a platform whose output
reaches donors and boards, consistent with the professional-credibility
framing in Product Vision §1) — specific audit and remediation process is
an implementation-time concern, not detailed further here. Internationalisation:
not required at v1 (single-Organisation, current operating language),
but the component architecture should not hardcode English strings in a
way that would require a rewrite later (i18n-ready, not i18n-complete).

## 7. Non-Functional Requirements

| Concern | Requirement |
|---|---|
| **Truncated-context visibility** | When Context Engine truncates (Platform Services §7), the frontend surfaces this to the user reviewing the output (a visible flag, not silent), consistent with EAS §7.2's human-oversight-is-structural principle — a human approving a Polish Gate should be able to see if the draft was produced from an incomplete context. |
| **Confidence and flag visibility** | Any AI-generated content surfaced to a human decision point (Grant Studio's `strategic_narrative`, Parliament Core's confidence heuristic, §2.3.2 of that spec) displays its confidence/flag state inline — never presented as unqualified fact. |
| **No client-side-only gating** | Every gated action's UI-level disable state is backed by a server-side check (§3) — the UI hint is a UX convenience, not the enforcement mechanism. |

## 8. Migration from `frontend/index.html`

Confirmed (EAS §11, restated here for this spec's own scope clarity): the
current MVP static playground is **not** the starting point for this
production frontend. It is retained, verbatim in spirit, as House of
Parliament's Playground module seed (`docs/10-` §1.14) — a different
application with different users and different scope. This frontend is
new build against the API surfaces already specified across every Layer
2/3 detail spec.

## 9. Open Items for Product Owner

- **Component library / design system choice** (§3) — an implementation
  decision (e.g. an existing React component library vs. a bespoke system)
  not made here; this spec defines the structural requirements a chosen
  library must satisfy (role-gating, Human Gate component reusability),
  not the library itself.
- **Exact WCAG audit process and cadence** (§6) — process detail, not an
  architectural blocker.
