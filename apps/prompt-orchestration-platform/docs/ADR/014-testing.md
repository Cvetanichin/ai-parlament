# ADR-014: Tiered Testing — Free Unit Tests on Every Push, Cost-Bearing Tests on Demand

**Status:** Accepted

## Context

Integration and end-to-end tests that call the live OpenAI API are valuable but cost money and tokens on every run. Running them on every commit would make CI slow and expensive without a proportional benefit for most changes (e.g. a documentation-only commit).

## Decision

Four test tiers (`TESTING_STRATEGY.md` §2): unit (mocked, every push), integration (live OpenAI, gated behind an env flag), end-to-end (full workflow, manual/scheduled), regression (triggered specifically before promoting a module `draft → active`). Every v1 module needs at least one passing unit test and one passing end-to-end test by the Phase 4 gate — non-negotiable minimum, not a target.

## Consequences

- Positive: fast, cheap CI feedback loop for most changes; cost-bearing tests run when they matter (before promoting a prompt to production use) rather than on every trivial push.
- Negative: unit-test-only CI can miss real API behavior changes (e.g. OpenAI schema enforcement quirks) between scheduled integration test runs. Accepted — the alternative (live API calls on every push) doesn't scale cost-wise for a project this size.

## Alternatives considered

- **Run full integration tests on every commit.** Rejected — cost and latency disproportionate to benefit at this stage.
