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
MVP precedent (Research, Writing).

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

## What's NOT done yet

- **`../docs/12-APIs/` §6's full endpoint catalog** is not implemented —
  these three endpoints are a first slice, not the whole catalog.
- **Grant Studio, Regulatory Knowledge Layer ingestion, the other seven
  ministries** — out of scope for this Phase 1 slice, per `../docs/20-Roadmap/`.
- **The `agent_runs`/`submission_packages` security-definer status-update
  function** — still an open item (Database Schema spec §14), not built.
