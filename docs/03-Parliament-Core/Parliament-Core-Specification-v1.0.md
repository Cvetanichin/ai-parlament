---
document: Parliament Core Specification — Workflow Engine & Agent Runtime
version: 1.0
status: APPROVED — approved by Product Owner 12 July 2026; §0 source-grounding caveat resolved against the real MVP source (found locally, `~/Downloads/parliamentary-ai-mvp/`, not via GitHub); §7's queue-backend question remains a non-blocking follow-up deferred to docs/15-Infrastructure/
parent: ../../00-EAS-v1.0.md (EAS §3.2 Layer 2, §3.3 Layer 3 service catalog, §11 repo restructuring, §13 priority 1)
existing_assets: backend/agents/pmAgent.js, backend/agents/ministryAdapter.js, backend/agents/vetoEngine.js, backend/agents/humanGates.js (parliamentary-ai-gov repo)
---

# Parliament Core — Workflow Engine & Agent Runtime — Specification v1.0

## 0. Note on Source Grounding — RESOLVED 12 July 2026

**Previously blocked, now resolved.** GitHub reads of `pmAgent.js`,
`ministryAdapter.js`, `vetoEngine.js`, and `humanGates.js` returned empty
repeatedly in the prior session. The real source was located locally instead
(`~/Downloads/parliamentary-ai-mvp/`, an unzipped copy of the repo, plus
`backend/server.js`, `backend/store.js`, `backend/llm/geminiClient.js`,
`backend/agents/researchMinistry.js`, `backend/agents/writingMinistry.js` —
every backend file) and read in full against this spec.

**Verdict: the spec's migration sections (§2.8, §3.8), built from the
README and roadmap description alone, turned out to match the real code
closely — this is a confirmation pass with small precision fixes, not a
redesign.** Specifically confirmed correct as originally written:

- `pmAgent.js`'s `MAX_ATTEMPTS = 2` — exactly matches ADR-0003's confirmed
  `voteOfNoConfidenceThreshold` default of `2`. The default was not a guess;
  it is the literal existing constant.
- The Vote of No Confidence sequence (forced context reset — no prior draft
  carried forward, only the structured error log — then error-log injection,
  then rewrite, capped at the threshold, then escalate) — `pmAgent.js`'s
  `runGovernanceLoop` matches §2.3 almost verbatim, down to the "forced
  context reset" and "error log injection" terminology, which come directly
  from the code's own comments, not an inference.
- `humanGates.js`'s four gates, `GATE_ORDER`, and status-transition
  behaviour — exact match to §2.4 and the EAS §3.1 Human Gates list.
- `vetoEngine.js`'s three tiers (deterministic: length/character-limit;
  lexical: required-keyword coverage; semantic: LLM-as-judge with an
  explicit "you are a DIFFERENT role from the drafting agent" instruction in
  its own prompt) — exact match to §2.3 and EAS §3.2's veto description,
  including the deliberate-separate-persona design intent.
- `ministryAdapter.js`'s `createLlmMinistry({name, buildPrompt, mockRun,
  parseResponse})` shape — exact match to §3.1's Ministry Adapter contract
  description.

**Small precision fixes made to this spec as a result** (not conflicts —
refinements): §2.3's confidence heuristic is now the real one, not a
placeholder (§2.3.2, new); §2.4 now cites the real gate-blocking enforcement
mechanism from `server.js` (§2.4, revised); §2.8 point 4 now describes the
real per-proposal (not global) audit log shape. See those sections for
detail. **No ADR was required** — nothing here contradicts the approved
spec severely enough to constitute an architecture change; this is the
spec catching up to source, which §0 always anticipated as the likely
outcome.

**One scope clarification surfaced by reading the real code:** the MVP only
implements two of the nine v1 Ministries (EAS §3.2) — Research and Writing.
Finance & Administration, Compliance (beyond `vetoEngine.js`'s Layer-2-only
veto logic), M&E, Reporting, Procurement, Fundraising (beyond the standalone
scraper artifact), and Development have **no existing code precedent** —
they are net-new Layer 2 ministries built to the Ministry Adapter contract
from scratch, not re-platformed from anything. Implementers should not
assume undiscovered source exists for these; there isn't any.

## 1. Purpose and Position in the Architecture

Workflow Engine and Agent Runtime are Layer 3 services (EAS §3.3). Together
they are what lets Layer 2 — the Prime Minister and the Ministry Library — stop
containing its own control flow and its own ad hoc agent-invocation pattern.

- **Workflow Engine** owns *sequencing*: what happens next, in what order, with
  what retries, and where a human must be asked before continuing.
- **Agent Runtime** owns *execution*: how a single ministry's drafting/analysis
  step actually runs, with what identity, against which prompt version and
  model, with what tools available to it.

A Workflow Instance's Task is executed by invoking an Agent through the Agent
Runtime; the Agent's result is what drives the Workflow Instance's next state
transition. Neither service holds ministry domain logic (that stays in Layer 2)
or regulatory rule content (that stays in the Regulatory Knowledge Layer,
`docs/05-`, EAS §6) — this spec is deliberately "thin and generic," which is
the point: it is infrastructure every current and future ministry shares.

## 2. Workflow Engine

### 2.1 Core Concepts

| Concept | Definition |
|---|---|
| **Workflow Definition** | A named, versioned state machine template — e.g. "Governance Loop v1," "Section Drafting v1" (Grant Studio's Proposal Builder uses one Workflow Definition per donor section, per Grant Studio spec §5). Authored once, instantiated many times. |
| **Workflow Instance** | A running instantiation of a Workflow Definition against a specific target (a Proposal, a Report, a section of either). Has current state, history, and a link to the `Ministry Task`(s) it has spawned. |
| **Task** | A unit of work assigned to exactly one ministry within a Workflow Instance. Maps to the EAS §4 `Ministry Task` entity. |
| **Transition** | A state change triggered by a Task's outcome (success, veto fail, timeout) or a human decision at a gate. |
| **Gate** | A transition that cannot fire automatically — it requires a Layer 1 Human Gate approval (EAS §3.1) before the Workflow Instance proceeds. |
| **Retry Policy** | Per-transition configuration: max attempts, backoff, and the transition to take on exhaustion (typically escalation to a Gate). |

### 2.2 State Machine Model

Baseline states every Workflow Definition composes from:

```
pending → running → (awaiting_human | veto_failed | completed | failed)
awaiting_human → running | cancelled
veto_failed → rewriting → running | escalated
escalated → awaiting_human
```

- `pending` — instance created, not yet started.
- `running` — a Task is currently executing via the Agent Runtime.
- `awaiting_human` — paused at a Human Gate (EAS §3.1); nothing proceeds until
  the gate records an approval, rejection, or Compliance Override.
- `veto_failed` — the Tripartite Veto Engine (Layer 2, calling the Layer 3
  Compliance Engine — see §5) returned a FAIL on the Task's output.
- `rewriting` — the Vote of No Confidence sub-workflow (§2.3) is active.
- `escalated` — Vote of No Confidence exhausted its retry budget; forced to a
  Human Gate rather than looping further.
- `completed` / `failed` / `cancelled` — terminal states.

Workflow Definitions may add domain-specific states (e.g. Grant Studio's
section-drafting workflow adds `context_assembly` before `running`), but every
Workflow Definition that involves LLM-generated content **must** route through
`veto_failed`/`rewriting`/`escalated` rather than defining its own ad hoc retry
logic — this is what makes Vote of No Confidence a platform guarantee rather
than something each ministry has to remember to implement correctly.

### 2.3 The Vote of No Confidence Pattern

Formalised as a reusable sub-workflow, not code living inside `pmAgent.js`:

```
Task executes → Agent Runtime returns output
   → Compliance Engine veto check (deterministic → lexical → semantic)
   → PASS: transition to next state (or `completed`)
   → FAIL: transition to `veto_failed`
        → forced context reset (Agent Runtime invalidates the Agent's working
          context — see §3.2)
        → structured error-log injection (veto failure reasons + rubric
          written into the next Task's input, not a vague "try again")
        → transition to `rewriting` → re-execute Task
        → PASS: continue
        → FAIL again: check retry count against the Workflow Definition's
          configured threshold (§2.3.1)
             → below threshold: repeat rewriting cycle
             → at/above threshold: transition to `escalated` → `awaiting_human`
               (Polish Gate)
```

This never loops indefinitely — the threshold check is mandatory, not optional,
in every Workflow Definition that uses this pattern.

#### 2.3.1 Vote of No Confidence threshold — CONFIRMED, resolves EAS §14 open decision

**Confirmed by Product Owner, 12 July 2026.** The threshold is a field on the
Workflow Definition (`voteOfNoConfidenceThreshold`, integer, default `2`), not
a global constant. This preserves the existing MVP's "two consecutive
failures" behaviour as the default for every current Workflow Definition,
while letting a future Workflow Definition (e.g. a lower-stakes internal
document vs. a donor submission) set a different threshold without a code
change.

### 2.3.2 Confidence Scoring (confirmed against real `pmAgent.js`)

The confidence heuristic is not a placeholder to design later — it already
exists in `runGovernanceLoop` and this spec adopts it as the Workflow
Engine's baseline algorithm rather than inventing a new one:

| Outcome | Confidence |
|---|---|
| Veto passed on the first attempt (no Vote of No Confidence triggered) | `high` |
| Veto passed after one or more Vote of No Confidence rewrite cycles | `medium` |
| Veto never passed within the threshold (escalated to Polish Gate) | `low` |

This is a three-value categorical signal, not a numeric score, and it is
computed once per Workflow Instance at the point the Task either clears the
veto or exhausts its retry budget — not a running per-attempt metric. The
Observability & Cost Service (`docs/17-AI-Governance/`) consumes this value
as one input among others (it does not replace the finer-grained
`compliance_findings.status` or extraction-confidence values used elsewhere
in the platform, e.g. Regulatory Knowledge Layer §8's 0–1 scale) — Workflow
Engine confidence is coarse by design, matching what the real code actually
computes.

### 2.4 Human Gate Integration

A Workflow Instance entering `awaiting_human` writes a Gate Request record
(target: the Proposal/Report/section, gate type: Strategic / Go-No-Go / Polish
/ Submission / Compliance Override, and — for `veto_failed`-originated gates —
the full veto finding history) that Layer 1 applications poll or subscribe to
via the Event Bus (`docs/04-Platform-Services/`). A human decision recorded at
the gate is the only input that can transition a Workflow Instance out of
`awaiting_human`. No API exists for a Workflow Definition or an Agent to
self-approve a gate — this is enforced at the Workflow Engine level, not left
to ministry discipline, per EAS §7.2.

**Confirmed real enforcement mechanism** (`backend/server.js`): the MVP
already blocks gate progression server-side with a `409` response, not just
client-side UI discipline — `POST /api/proposals/:id/gates/goNoGo` rejects
`decision: "approved"` with `409` unless `proposal.researchResult` already
exists, and `POST /api/proposals/:id/run` (the governance loop) rejects with
`409` unless the Go/No-Go gate's status is `approved`. The Workflow Engine's
target contract is this same pattern, generalised: a Gate transition or a
Task dispatch that has an unmet precondition returns a structured error, it
does not silently no-op or proceed.

### 2.5 Task Queue & Scheduling

- **Dependencies:** a Task may declare `dependsOn: [taskId, ...]`; the
  Workflow Engine will not dispatch it until all dependencies reach a
  successful terminal state.
- **Parallel execution:** independent Tasks within a Workflow Instance (e.g.
  Logframe Studio and Budget Studio both consuming the same approved Concept
  Note) may run concurrently.
- **Scheduling:** cron-style triggers for time-based Workflow Instances
  (deadline reminders, periodic due-diligence refresh per Grant Studio §4.2)
  are a Workflow Definition property, not a separate scheduler service —
  avoids a second source of truth for "when does this run."
- **Queue backend:** per the historical roadmap's stack recommendation
  (Redis + BullMQ), confirmed as the default unless `docs/15-Infrastructure/`
  overrides it.

### 2.6 Data Contracts

```json
// WorkflowDefinition
{
  "id": "string",
  "name": "string",
  "version": "integer",
  "states": ["string"],
  "transitions": [{ "from": "string", "to": "string", "trigger": "string" }],
  "voteOfNoConfidenceThreshold": "integer, default 2",
  "gates": [{ "atState": "string", "gateType": "strategic|go_no_go|polish|submission|compliance_override" }]
}

// WorkflowInstance
{
  "id": "string",
  "workflowDefinitionId": "string",
  "targetType": "proposal|report|proposal_section|...",
  "targetId": "string",
  "state": "string",
  "history": [{ "state": "string", "enteredAt": "timestamp", "reason": "string" }],
  "voteOfNoConfidenceCount": "integer",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}

// Task
{
  "id": "string",
  "workflowInstanceId": "string",
  "ministry": "string",
  "dependsOn": ["taskId"],
  "status": "pending|running|succeeded|failed",
  "agentInvocationId": "string, set once dispatched (see §3.6)",
  "retryCount": "integer"
}
```

### 2.7 API Surface (indicative — full contract in `docs/12-APIs/`)

`POST /workflows/{definitionId}/instances` (start), `GET /workflows/instances/{id}`
(status), `POST /workflows/instances/{id}/tasks/{taskId}/complete` (Agent Runtime
callback), `POST /workflows/instances/{id}/gates/{gateId}/decide` (Layer 1 human
decision), `POST /workflows/instances/{id}/cancel`.

### 2.8 Migration from `pmAgent.js`

`pmAgent.js`'s `runGovernanceLoop` currently *is* the Vote of No Confidence
loop, implemented as direct control flow calling ministry functions in
sequence. Re-platforming means:

1. Express the existing loop as a Workflow Definition (§2.6) rather than
   imperative code — the states in §2.2 should map directly onto what
   `runGovernanceLoop` already does implicitly.
2. `pmAgent.js`'s task-allocation responsibility (deciding which ministry
   handles what) stays in Layer 2 as the Prime Minister's job; it now calls
   `POST /workflows/{definitionId}/instances` instead of invoking ministry
   code directly.
3. The existing four human gates (`humanGates.js`) become Gate Requests
   (§2.4) rather than a separate module the PM checks manually — same
   behaviour (nothing proceeds without human sign-off), formalised as a
   platform contract every Workflow Definition inherits instead of something
   each workflow author has to remember to call.
4. `store.js`'s audit log is **per-proposal** (`proposal.auditLog`, an array
   on each in-memory proposal record, appended to by `logEvent(proposalId,
   actor, action, detail)`), not a single global log — confirmed against
   real source, refining what §0 previously left uncertain. This maps
   cleanly onto the Workflow Instance `history` array (§2.6), which is
   already per-instance by construction, persisted to PostgreSQL per
   `docs/11-Database-Schema/` §7's append-only audit table instead of
   resetting on restart. No structural change to this migration point was
   needed — the real shape was already instance-scoped, matching the
   target.

**Confirmed against real source (§0):** the loop as documented (context
reset → error injection → rewrite → escalate) matches `pmAgent.js`'s
`runGovernanceLoop` almost verbatim, including matching terminology in the
code's own comments. This is a re-expression as a Workflow Definition, not
a redesign.

## 3. Agent Runtime

### 3.1 Core Concepts

| Concept | Definition |
|---|---|
| **Agent** | A registered ministry capability — e.g. "Research: Go/No-Go Risk Matrix," "Writing: Section Drafter." Not a person, not the ministry itself — one ministry may register several Agents for different task types. |
| **Agent Version** | A specific, immutable combination of a Prompt Version (Prompt Registry, `docs/04-`) and a model binding (via the LLM Gateway, EAS §3.4). Every invocation is against exactly one Agent Version. |
| **Agent Invocation** | A single execution: input, output, Agent Version used, timing, cost, and — critically — a link back to the Task that triggered it, for audit (EAS §2, principle 8). |
| **Ministry Adapter contract** | The existing MVP's shape (prompt builder, deterministic mock fallback, response parser) — retained as-is, promoted from a code convention every ministry file happens to follow into a platform-enforced interface the Agent Runtime validates at registration time. |

### 3.2 Agent Lifecycle

`Register` (a ministry declares an Agent: its Ministry Adapter functions, its
default Prompt Version, its allowed tool list) → `Invoke` (Workflow Engine
dispatches a Task to it) → `Reset` (forced context reset on Vote of No
Confidence, §2.3 — the Agent Runtime clears working context, it does not
retain partial reasoning from the failed attempt) → `Deprecate` (an Agent
Version is superseded by a new Prompt Version; old Agent Invocations remain
queryable for audit, but new Tasks stop routing to the deprecated version).

### 3.3 Tool Access & Permissions

Each Agent declares the tools it may call (e.g. Regulatory Knowledge Layer's
Compliance API, Knowledge Platform search, Context Engine) at registration.
The Agent Runtime enforces this allow-list — an Agent cannot call a tool it
did not declare, even if the underlying platform service would technically
permit it. This is the mechanism that keeps, for example, the Writing
Ministry's drafting Agent from directly querying the Budget API in a way that
bypasses the Finance & Administration ministry's ownership of budget logic.

### 3.4 Identity & Audit Binding

Every Agent Invocation record carries: which Agent, which Agent Version
(therefore which Prompt Version and which model), which Task and Workflow
Instance triggered it, full input and output, token cost, and latency. This
is the concrete mechanism behind EAS §2 principle 8 (auditable by
construction) and EAS §9's cost-control NFR — it is not an added feature,
it is a required field on every invocation from the first Agent registered.

### 3.5 Binding to LLM Gateway

The Agent Runtime is the **only** caller of the Layer 4 LLM Gateway. No
ministry code calls a model SDK directly — enforced by the Ministry Adapter
contract only exposing a `buildPrompt` / mock-fallback / `parseResponse`
shape, with actual model invocation happening inside the Agent Runtime
between those two steps. This is what makes EAS §2 principle 5 (vendor
neutrality) real rather than aspirational: swapping Gemini for Claude for a
given Agent Version is a Layer 4 configuration change, not a ministry code
change.

### 3.6 Data Contracts

**Physical mapping (per ADR-0007, Accepted):** these are abstract data
contracts, not table names to create fresh. `Agent` is physically
`ai_agents`, `AgentVersion` is physically `prompt_modules`, and
`AgentInvocation` is physically `agent_runs` — the real, live Intelligence
Workspace tables, extended additively. See `docs/11-Database-Schema/` §3 for
the exact `ALTER TABLE` statements and `docs/08-Project-Operations/` §6 for
the field-by-field reconciliation. Implementers should read every
`agentVersionId` below as `prompt_module_id` and every `AgentInvocation` row
as an `agent_runs` row in the actual schema.

```json
// Agent
{
  "id": "string",
  "ministry": "string",
  "name": "string",
  "currentVersion": "agentVersionId",
  "allowedTools": ["string"]
}

// AgentVersion
{
  "id": "string",
  "agentId": "string",
  "promptVersionId": "string",
  "modelBinding": { "provider": "string", "model": "string" },
  "status": "active|deprecated"
}

// AgentInvocation
{
  "id": "string",
  "agentVersionId": "string",
  "taskId": "string",
  "input": "object",
  "output": "object",
  "tokenCost": "number",
  "latencyMs": "integer",
  "startedAt": "timestamp",
  "completedAt": "timestamp"
}
```

### 3.7 API Surface (indicative)

`POST /agents/register`, `POST /agents/{id}/invoke` (called by Workflow
Engine, not directly by Layer 1), `GET /agents/{id}/invocations` (audit
query), `POST /agents/{id}/deprecate`.

### 3.8 Migration from `ministryAdapter.js`

The existing shape — prompt builder, deterministic mock fallback (used when no
real API key is configured, per the README), response parser — is exactly the
Agent registration contract in §3.1 and does not need to change conceptually.
What changes:

1. The mock fallback becomes a first-class `AgentVersion` with a `mock`
   provider binding, not a special-cased branch inside `geminiClient.js` —
   this means the House of Parliament (`docs/10-`) can test against mock
   Agent Versions using the same invocation path as real ones.
2. Prompt text currently inline in each ministry file (`researchMinistry.js`,
   `writingMinistry.js`) moves to the Prompt Registry (`docs/04-`) as
   versioned Prompt Versions; the Ministry Adapter's `buildPrompt` function
   becomes "assemble a Context Engine request using this Prompt Version," not
   "return a hardcoded string."
3. `geminiClient.js` becomes the first LLM Gateway provider adapter, not the
   whole gateway — the gateway's multi-provider abstraction is new; the
   Gemini-calling code inside it is retained.

**Confirmed against real source (§0):** `geminiClient.js`'s
`generateText(prompt, { mock })` — call the real model if `GEMINI_API_KEY`
is set, fall back to the caller-supplied `mock()` function otherwise, model
pinned to `gemini-1.5-pro` — is exactly the shape point 1 and point 3
describe. No changes to this migration section were needed.

## 4. Interaction Model

```
Prime Minister (Layer 2) → POST /workflows/{def}/instances
Workflow Engine → dispatches Task → Agent Runtime.invoke(agentId, taskInput)
Agent Runtime → Context Engine (assemble prompt) → LLM Gateway → model
Agent Runtime → returns AgentInvocation result → Workflow Engine
Workflow Engine → Compliance Engine veto check (via Layer 2 Compliance ministry)
   → PASS → next Task or `completed`
   → FAIL → Vote of No Confidence sub-workflow (§2.3)
```

Layer 1 applications never call Workflow Engine or Agent Runtime directly for
ministry work — they call Layer 2 (e.g. Grant Studio calls the Research
ministry's API, which starts a Workflow Instance). The one exception is Human
Gate decisions (§2.4), which Layer 1 posts directly to the Workflow Engine,
since gate approval is a human-executive act, not a ministry act.

## 5. Compliance/Veto Integration Point

The Tripartite Veto Engine remains a Layer 2 concept (it is the Compliance
ministry's mechanism, EAS §3.2) but its three tiers call out to Layer 3:

- **Deterministic** tier runs inside the Workflow Engine's transition logic
  directly (character limits, budget arithmetic) — no LLM call, no external
  service, per EAS §9's testability NFR.
- **Lexical** and **Semantic** tiers call the Regulatory Knowledge Layer's
  Compliance API (`docs/05-`) and an Agent Runtime invocation respectively —
  full contract deferred to that spec, referenced here only to confirm the
  Workflow Engine's `veto_failed` transition (§2.2) is triggered by their
  combined result, not by Workflow Engine logic re-implementing rule checks.

## 6. Non-Functional Requirements Specific to This Service

| Concern | Requirement |
|---|---|
| **Idempotency** | Re-dispatching a Task that already has a terminal-state `AgentInvocation` must not re-execute it — required for safe retry after a Workflow Engine crash mid-dispatch. |
| **Concurrency** | Parallel Tasks within one Workflow Instance (§2.5) must not race on shared state (e.g. two Tasks both writing to the same Proposal section) — enforced by Task-level locking, not application-level discipline. |
| **Observability** | Every state transition and every Agent Invocation emits an event to the Event Bus (`docs/04-`) — this is the raw material the Observability & Cost Service (EAS §3.3) aggregates; Workflow Engine and Agent Runtime do not compute cost/confidence dashboards themselves. |
| **Backward compatibility** | An Agent Version, once used by any completed Workflow Instance, is never deleted — only deprecated — so historical audit queries (EAS §9 auditability) remain answerable. |

## 7. Open Items for Product Owner

- **Queue backend** (§2.5) — Redis + BullMQ remains the confirmed default
  pending `docs/15-Infrastructure/` confirmation; tracked as a non-blocking
  follow-up (that spec is already `SPECIFIED`, deployment-runbook detail not
  yet finalised), not a blocker to implementing this spec's data contracts
  and API surfaces.
- ~~**Committee modelling**~~ — **resolved**: the Workflow Definition
  pattern (multiple ministries as parallel Tasks with a joint Gate, no
  separate "Committee" primitive) is confirmed sufficient. Both Grant
  Studio Committees now specified — the pre-award Research+Compliance
  Consortium Builder Committee (Grant Studio spec §4) and the post-award
  Partner Management Committee (Grant Studio spec §4.3, Procurement +
  Finance & Administration + Compliance + M&E) — are described purely in
  these terms with no request for a distinct primitive, confirming this
  spec's original assumption held once the dependent specs were actually
  written.
