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

**Still not exercised:** the LLM Gateway's live provider calls (no
`ANTHROPIC_API_KEY`/`GEMINI_API_KEY` set as a function secret on staging,
so every invocation used the mock fallback path — correctly, but that
means the real Anthropic/Gemini HTTP call code in `llmGateway.ts` remains
unverified). Setting a real key as a function secret would close this gap.

**Test artifacts left in staging**, disposable, not yet cleaned up:
`auth.users`/`auth.identities` row for `phase1-test@quorum.test`,
"Phase 1 Test Org" (`organisations`), "Phase 1 Test Project` (`projects`),
and one completed `workflow_instances` row plus its history/audit trail.

## What's NOT done yet

- **`../docs/12-APIs/` §6's full endpoint catalog** is not implemented —
  these three endpoints are a first slice, not the whole catalog.
- **Grant Studio, Regulatory Knowledge Layer ingestion, the other seven
  ministries** — out of scope for this Phase 1 slice, per `../docs/20-Roadmap/`.
- **The `agent_runs`/`submission_packages` security-definer status-update
  function** — still an open item (Database Schema spec §14), not built.
