---
document: Testing Specification
version: 1.0
status: APPROVED — approved by Product Owner 12 July 2026
parent: ../../00-EAS-v1.0.md (EAS §9 Testability NFR)
related_specs: ../03-Parliament-Core/Parliament-Core-Specification-v1.0.md, ../10-House-of-Parliament/House-of-Parliament-Specification-v1.0.md, ../19-Deployment/Deployment-Specification-v1.0.md
---

# Testing — Specification v1.0

## 0. Scope and Priority Order

EAS §9 sets the governing rule: deterministic Compliance Engine rules
(character limits, budget arithmetic, required-field completeness) must
have full automated coverage **before** any semantic/LLM-based check ships
alongside them. This spec's structure follows that priority, highest-value
surface first, not layer-by-layer for its own sake.

## 1. Test Pyramid by Priority

### 1.1 Deterministic rule coverage (highest priority, ships first)

Every deterministic Compliance Engine validator (Grant Studio §8:
Mathematical Validator, Character Count Validator, Procurement Threshold
Validator, and the deterministic tier of the Tripartite Veto Engine —
confirmed against real `vetoEngine.js`'s `deterministicCheck`, Parliament
Core §0) requires 100% branch coverage before merge. These are plain
functions with no LLM call (EAS §9) — there is no excuse for partial
coverage here, and no semantic validator ships alongside an
under-tested deterministic one.

### 1.2 Veto Engine regression suite

Golden-file test set: a corpus of known-good and known-bad drafts per
constraint type (character-limit violations, missing required keywords,
semantically incoherent drafts), each with an expected PASS/FAIL verdict
per tier (deterministic/lexical/semantic). Confirmed against real source
(Parliament Core §0): `vetoEngine.js`'s `mockJudge` function already
encodes two concrete semantic-failure heuristics (draft too short, draft
truncated mid-sentence) — these become the first two golden-file cases,
not invented fresh, since they're literally what the existing fallback
already checks for.

### 1.3 Workflow Engine state-machine tests

Every transition in Parliament Core §2.2's state diagram gets an explicit
test: `pending → running`, `veto_failed → rewriting → running`, the Vote
of No Confidence threshold boundary (passes at attempt N, escalates at
N+1 — directly testable against `voteOfNoConfidenceThreshold`, ADR-0003),
and the `409` gate-precondition-unmet cases confirmed against real
`server.js` behaviour (Parliament Core §2.4).

### 1.4 Agent Runtime / mock-provider tests

Every ministry's Agent Version is tested against its `mock` provider
binding (Parliament Core §3.8) as the default CI path — no test suite run
should require a real `GEMINI_API_KEY` or any live model call, matching
the existing MVP's own design intent ("the whole governance loop is
demoable with zero external dependencies," confirmed comment in real
`geminiClient.js`, Parliament Core §0).

### 1.5 Integration tests per Grant Studio module

Each module's data contract (Grant Studio §3.1, §5.1–§10.1) gets an
integration test exercising its API surface against a test Organisation —
e.g. Eligibility Engine: opportunity in → `eligibility_reports` row out with
correct `recommendation` given known inputs.

### 1.6 Multi-tenancy / RLS isolation tests

A dedicated suite (not folded into feature tests) that asserts: a user in
Organisation A cannot read or write any row scoped to Organisation B,
across every tenant-scoped table (Database Schema §1, ADR-0005). This
suite runs against every new table added by any future spec — a new table
without an RLS isolation test is not considered complete, regardless of
how correct its business logic tests are.

### 1.7 Prompt Evaluation / Regression Harness

The mechanism behind House of Parliament's Benchmarking module (`docs/10-`
§1.12): batch-runs a Prompt Version's `test_cases`
(`{input, expectedCriteria}`, Platform Services §2.1) and reports pass
rate. This spec adds the CI-gating rule House of Parliament §1.12
deliberately left as a human judgement call, not a mechanical block:

**Distinction, stated precisely to avoid contradicting House of
Parliament §1.12:** a *code* change to the Benchmarking harness itself, or
to shared ministry infrastructure, is gated by CI in the normal sense (must
pass before merge). A *Prompt Version's* promotion decision (draft →
active) remains a human judgement call at House of Parliament's Prompt IDE
(§4 of that spec) — Benchmarking results inform that human, they do not
mechanically block or allow the promotion. These are two different gates
on two different kinds of change; this spec does not weaken House of
Parliament §1.12's design.

## 2. Staging Validation Testing

Every migration in `docs/11-Database-Schema/` that touches a real, live
table must pass its test suite against a Supabase branch or the cloned
staging project (ADR-0007's mandatory mitigation, `docs/19-Deployment/`)
before promotion — this is a deployment-process requirement this spec
inherits, not a new one it invents.

## 3. Non-Functional Requirements

| Concern | Requirement |
|---|---|
| **Coverage target** | 100% branch coverage for deterministic Compliance Engine logic (§1.1); no fixed percentage target for semantic/LLM-based logic, which is evaluated by pass rate against golden-file/`test_cases` sets instead (§1.2, §1.7) — coverage percentage is the wrong metric for non-deterministic code. |
| **CI gating** | §1.1–§1.6 run on every PR; §1.7 (prompt regression) runs on any change touching `prompt_modules` content or the Benchmarking harness itself, per the distinction in §1.7. |
| **No live-model dependency in CI** | Confirmed per §1.4 — CI never requires a real API key; mock provider bindings are the default and mandatory CI path. |

## 4. Open Items for Product Owner

- **Exact golden-file corpus size** for the Veto Engine regression suite
  (§1.2) — starts from the two confirmed real-code heuristics, grows as
  more failure modes are observed in real use; no fixed target set here.
- **Prompt regression pass-rate threshold** that should prompt a human to
  reconsider a promotion (informational, per §1.7, not a hard gate) — a
  Product Owner or delegated `is_platform_operator` judgement call, not
  fixed in this spec.
