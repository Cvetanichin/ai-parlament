# Implementation — Roadmap Phase 0 + 1

This is where Claude Code implements what's Approved in `../docs/`, per the
governance model in the top-level `README.md`. Consolidated into this repo
(`ai-parlament`) rather than a separate `parliamentary-ai-gov` repo, which
doesn't exist on GitHub and this session had no access to create.

## Status

**Phase 0 (Foundation)** — done, already live on both the staging and
production Supabase projects (see `../docs/11-Database-Schema/` §17–§18):
multi-tenancy, identity, staging-validation discipline.

**Phase 1 (Governance Layer)** — Workflow Engine + Agent Runtime
(`../docs/03-Parliament-Core/`), re-platforming the two ministries with real
MVP precedent (Research, Writing). **Deployed to staging
(`urhocsijfzkepebsmstx`) and verified**, 12 July 2026 — see Verification below.

## What's built

```
supabase/
  migrations/          -- the 11 migrations already applied to staging+production
                           (01-10 recorded here for source control; 11 is new:
                           Phase 1's seed data — Governance Loop Workflow
                           Definition + the three Agents)
  functions/
    _shared/
      supabaseAdmin.ts   -- service-role client
      llmGateway.ts      -- multi-provider LLM Gateway (Anthropic default, Gemini,
                             mock fallback) — Layer 4, EAS §3.4
      auth.ts            -- caller resolution + organisation membership + gate-role check
      agentRuntime.ts    -- Agent Runtime (Parliament Core §3): register/invoke,
                             writes real agent_runs rows
      vetoEngine.ts      -- Tripartite Veto Engine, ported from vetoEngine.js;
                             semantic tier is its own logged Agent Invocation
                             ("compliance_judge"), not a bare LLM call
      workflowEngine.ts  -- Workflow Engine (Parliament Core §2): the Vote of No
                             Confidence sub-workflow and Human Gate mechanics,
                             ported from pmAgent.js and humanGates.js
      ministries/
        research.ts      -- ported verbatim from researchMinistry.js
        writing.ts       -- ported verbatim from writingMinistry.js
    workflow-research-run/    -- POST: runs the Go/No-Go Risk Matrix
    workflow-governance-run/  -- POST: Writing -> Veto -> Vote of No Confidence loop
    workflow-gate-decide/     -- POST: Human Gate decision (owner/admin only)
```

Every module is ported from the real MVP source
(`~/Downloads/parliamentary-ai-mvp/` at build time), confirmed against
Parliament Core spec §0's source-grounding finding — this is a re-platform,
not a rewrite. One real architecture fix made during porting: the veto
engine's semantic check now runs as its own registered Agent
(`compliance_judge`) with a logged `agent_runs` row, instead of a bare LLM
Gateway call that would have bypassed EAS principle 8 (auditable by
construction).

## Known constraint discovered while building

`agent_runs.project_id` is `NOT NULL` on the real, live table — confirmed
against the actual schema, not assumed. Every Agent Invocation (including
the demo governance loop) must be recorded against a real `projects` row.
The three Edge Functions above all take a `projectId` for this reason.

## Verification

All three Edge Functions are deployed to staging and `ACTIVE` — Supabase's
Deno bundler type-checks and resolves the full import graph at deploy time,
so a broken import or syntax error would have failed the deploy outright,
not just logged quietly later.

**Verified two ways, escalating in strength:**

1. **SQL dry run** — the actual sequence of database writes every function
   performs was replayed directly against staging with a seeded test
   organisation/project, before any HTTP path was available. Caught one
   real bug before it ever ran for real: `decideGate` originally
   transitioned every approval to `completed` regardless of which gate —
   correct for Polish, wrong for Go/No-Go, which needs to route back to
   `running` so the governance loop can be dispatched next. Fixed by
   adding an explicit `gateType: "go_no_go" | "polish"` parameter
   (matching the real MVP's per-gate `GATE_STATUS_FIELD` mapping in
   `humanGates.js`, which this port had initially collapsed into one
   generic outcome). Redeployed.

2. **Full live HTTP test, with real auth** — a genuine test user was
   created directly in staging's `auth.users`/`auth.identities`
   (`phase1-test@quorum.test`), added as `owner` of a test organisation,
   given a test project. A real session token was obtained via
   Supabase's `/auth/v1/token` endpoint (executed via the Browser pane's
   `fetch()`, since no other POST-capable HTTP client was available this
   session) and used to call all three deployed functions in sequence —
   research → Go/No-Go gate → governance loop → Polish gate — every call
   returning `200` with the correct body. This is the strongest
   verification done this session: it exercises `auth.ts`'s `resolveCaller`
   JWT validation and `organisation_members` role check for real, not
   simulated, and it re-confirmed the gate-type fix live (`go_no_go`
   approval correctly returned `state: "running"`). The resulting
   `workflow_instance_history` for that live run:

   ```
   awaiting_human  "Go/No-Go Risk Matrix ready — human decision required"
   running         "go_no_go gate decision: approved"
   running         "Writing ministry dispatched"
   awaiting_human  "Draft cleared veto -- awaiting Polish Gate"
   completed       "polish gate decision: approved (Looks good, cleared for the demo.)"
   ```

   The governance loop's veto result: all three tiers passed
   (deterministic, lexical, and semantic — the semantic check running as
   its own `compliance_judge` Agent Invocation, per the fix made during
   porting), `attempts: 1`, `confidence: "high"`.

3. **Live-model verification, after `ANTHROPIC_API_KEY` was set as a
   staging function secret** — the same full sequence, re-run against a
   fresh test user/org/project/instance, this time exercising the actual
   `fetch()` calls to `api.anthropic.com` in `llmGateway.ts`. Confirmed via
   `agent_runs.token_cost` on every row (never `null`, unlike the mock
   path): 6 real, billed Anthropic calls across the run — `research_
   ministry` ×2 (one from a bug hit below, one clean), `writing_ministry`
   ×2 and `compliance_judge` ×2 (Vote of No Confidence attempt 1 and 2).

   **Found and fixed a second real bug, this one only reachable against a
   real model:** the Research Ministry's `parseResponse` called
   `JSON.parse` directly on the model's raw output. Claude routinely wraps
   JSON in a ` ```json ... ``` ` markdown fence despite the prompt's
   explicit "no prose" instruction — the mock path never produces this,
   so it was invisible until a real call happened. Fixed with a
   fence-stripping helper in `ministries/research.ts` (`stripCodeFence`),
   redeployed, re-verified — the retry returned real, substantive Claude
   output (a `78` score with six specific, non-templated risk items) with
   no parse fallback triggered.

   **The Vote of No Confidence loop encountered, and correctly handled, a
   genuine model failure mode — not a code bug:** Claude's draft
   self-reported "Character count: 499" but the actual string (including
   markdown headers, a `---` divider, and framing text like "Here is the
   revised Annex A narrative:") was 700 characters against a 500-character
   limit. The deterministic veto tier — which trusts an actual `.length`
   check, never the model's own claim — correctly failed it. Attempt 2
   also failed the same way (error-log injection didn't stop the model
   from adding wrapper text again), so the loop correctly exhausted its
   threshold and escalated: `vetoPassed: false`, `attempts: 2`,
   `confidence: "low"`. This is exactly the failure mode EAS's zero-
   hallucination deterministic tier exists to catch, now demonstrated
   against a real model rather than only reasoned about.

4. **Compliance Override enforcement, added and verified after Product
   Owner review of the design question above.** Confirmed: require
   justification whenever Polish Gate approval follows a Vote of No
   Confidence escalation. Also implemented, per the same review: require
   justification whenever Go/No-Go approval follows a `NO-GO` research
   recommendation — extending EAS §3.1's Compliance Override control (*"an
   authorised human accepts a flagged risk with a logged justification; it
   never silently suppresses a flag"*) from Grant Studio §8.1's
   `compliance_findings`-specific mechanism to this slice's two real
   flagged-risk cases.

   `decideGate` (`workflowEngine.ts`) now detects both triggers and throws
   `override_justification_required` (mapped to HTTP `400`) if
   `overrideJustification` is missing on a triggering approval. Detection
   reuses existing data rather than adding schema: the Polish trigger
   checks for an `escalated` row in `workflow_instance_history`; the
   Go/No-Go trigger reads the recommendation back out of the
   `feasibility_assessment` `audit_events` row's `detail.output`. When an
   override fires, `audit_events.detail` now records `wasOverride`,
   `overrideReason`, and `overrideJustification` explicitly — the
   distinction the original design question flagged as missing from the
   audit trail is now queryable, not just present in a free-text note.

   **Verified live, both paths, forcing escalation with a deliberately
   impossible 10-character limit** (guarantees deterministic veto failure
   regardless of what the model writes): Polish Gate approval without
   `overrideJustification` correctly returned `400` with the exact
   expected reason (`vote_of_no_confidence_escalated`); the same approval
   with a justification returned `200`, `wasOverride: true`, confirmed via
   `audit_events.detail` containing the full override record. This test
   incidentally validated something beyond its own scope: faced with the
   genuinely impossible constraint (10 characters vs. a required 15-
   character phrase), Claude refused to fabricate a fake-compliant draft
   and explained the contradiction instead — and the **semantic** veto
   tier caught this independently of the deterministic tier, correctly
   judging that "meta-commentary about impossible constraints" isn't a
   scorable Annex A document. Two tiers, two independent reasons, same
   correct verdict — the defense-in-depth the three-tier veto design
   exists for, demonstrated rather than assumed.

   The Go/No-Go trigger's detection logic was exercised live too (a real
   research call returned `CONDITIONAL`, not `NO-GO`, so the trigger
   correctly did *not* fire) but a live `NO-GO`-triggered block/override
   pair wasn't captured this session, since real model output isn't
   scriptable — the code path is identical to the Polish case and the
   detection logic (`getResearchRecommendation`) was read-tested against
   real `audit_events` data during this run.

5. **Submission Gate added — override enforcement extended to a third gate,
   plus a gate-sequencing integrity fix required to make it sound.** Once
   three gates (Go/No-Go, Polish, Submission) share one generic
   `awaiting_human` state, nothing previously stopped a client from calling
   a gate out of order — most dangerously, `submission` straight after
   Research, bypassing Go/No-Go and Polish (and their override checks)
   entirely. `decideGate` now derives the expected next gate
   (`getExpectedGateType`, reading the most recent relevant `audit_events`
   row — `feasibility_assessment` → `go_no_go`, `veto_result` → `polish`,
   an approved `polish` `gate_decision` → `submission`) and rejects a
   mismatched `gateType` with `gate_precondition_unmet` (409). Polish Gate
   approval no longer transitions to `completed` — it now returns to
   `awaiting_human` for the Submission Gate; **only Submission Gate
   approval reaches `completed`**, per EAS §9's Liability NFR ("no fully
   autonomous submission path exists anywhere in the platform... always a
   named, logged, human act").

   A third override trigger was added for Submission: approving it requires
   `overrideJustification` whenever *any* earlier gate in the instance's
   history was itself an override (`hasAnyPriorOverride`, reading every
   `gate_decision` audit event for the instance). This is deliberate —
   an override doesn't get "used up" once logged at Polish or Go/No-Go; the
   final, most consequential gate (the one that reaches a donor) requires
   the human to consciously re-confirm it, not silently inherit an earlier
   human's judgment call.

   **Verified live, full sequence, against a real Anthropic model** (fresh
   test user/org/project/instance): research → Go/No-Go approval →
   *attempted Submission out of order, correctly blocked* (409,
   `gate_precondition_unmet: instance is awaiting the 'polish' gate, not
   'submission'` — the new sequencing check firing for real, not simulated)
   → governance loop (the same character-count self-report mismatch
   surfaced in run 3 above recurred independently here: draft self-reported
   573 characters, actual length 687/1510 against a 600 limit, both
   attempts correctly failed by the deterministic tier, exhausted the
   threshold, escalated) → Polish Gate approval without justification
   correctly blocked (400, `vote_of_no_confidence_escalated`) → Polish Gate
   approval **with** justification succeeded and returned `state:
   "awaiting_human"`, not `"completed"` (confirms the new non-terminal
   Polish transition) → Submission Gate approval without justification
   correctly blocked (400, `prior_override_in_workflow:
   vote_of_no_confidence_escalated` — the new Submission trigger firing) →
   Submission Gate approval **with** justification succeeded, returning
   `state: "completed"` — the only point in this run the instance reached
   `completed`. The full `workflow_instance_history` for this run confirms
   the sequence exactly, including the `"— awaiting Submission Gate"`
   transition-reason suffix.

**Test artifacts**: every test run's users/orgs/projects/instances were
created and then fully deleted from staging after verification — nothing
left behind.

## What's NOT done yet

- **`../docs/12-APIs/` §6's full endpoint catalog** is not implemented —
  these three endpoints are a first slice, not the whole catalog.
- **Grant Studio, Regulatory Knowledge Layer ingestion, the other seven
  ministries** — out of scope for this Phase 1 slice, per `../docs/20-Roadmap/`.
- **The `agent_runs`/`submission_packages` security-definer status-update
  function** — still an open item (Database Schema spec §14), not built.
