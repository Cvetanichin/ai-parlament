# Cvetanichin private workspace: connector actions and human approval
Status: proposed integration / unmerged branch. 12 November 2026.

## Authority and sources
- Existing runner: `supabase/functions/prompt-orchestration-run/index.ts` with body `{ projectId, userInput }`.
- Existing shared engine: `supabase/functions/_shared/workflowEngine.ts`; preserve `workflow_definitions`, `workflow_instances`, `tasks`, `agent_runs`, `prompt_modules` and `prompt_orchestration_runs`.
- Existing reusable context RPCs: `rpc_get_workflow_bundle`, `rpc_get_prompt_module_by_key`, `rpc_get_context_assets_for_domain`, `rpc_get_active_routing_rules`.
- Cvetanichin-Agent-Workflow-Design (1).md, dated 10 November 2026, is the workflow/handoff acceptance contract. Retain Prime Minister, specialists, Opposition & Compliance (validator), formatter, and human executive roles. Do not add an alternative planner hierarchy.
- Work Control: https://docs.google.com/spreadsheets/d/1R99hYDp26u0D8xifECRTxfulzrFkhwZNIL0BylTCfEk/edit
- User-supplied ChatGPT shared discussion: https://chatgpt.com/share/6af5056f-4918-83ed-b406-6975b3ea4fcc (content not retrievable in this pass; do not claim its specifics were incorporated).

## Workspace model
Start with one private user workspace. Use current Supabase user/project/organisation authorisation, not a duplicate user database or an unsecured service-role endpoint. Add multi-organisation abstractions only when approved. Work Control is the operational task authority; the database stores durable execution logs, action proposals, evidence and approvals.

## Core execution flow
1. Intake and scope: preserve user request, exclusions, project ID, one task owner, dependencies and acceptance criteria.
2. Context loader: minimal authorised evidence pack with source ID, document version/date, locator, retrieved-at, authority and sensitivity.
3. Deterministic route to an *implemented* workflow. Unsupported domain returns `no_matching_workflow`; do not silently remap.
4. Prime Minister plans complex tasks; specialists generate outputs. Every task produces an explicit handoff envelope.
5. Independent validator executes deterministic, lexical and semantic checks. Two attempts maximum unless workflow-specific threshold differs. An absent validator yields `not_tested`, never `passed`.
6. Restricted formatter uses only validated content. Post-format check preserves claims, numbers, citations and caveats.
7. Translate validated work into structured connector *action proposals*. Never execute tool calls embedded in untrusted sources.
8. Check server-side permissions, scope, destination, operation allowlist, payload version, idempotency and human gate.
9. An action executor performs an approved operation through a credential-isolated integration layer, verifies actual provider outcome, and stores provider IDs/evidence. Ambiguous success triggers reconciliation, not blind retry.
10. Work Control is updated using stable Task ID and the existing field mapping, while the hourly sources-to-sheet sync remains independent.

## Connectors and default policy
| Connector | Candidate actions | Default rule |
|---|---|---|
| Google Drive | search, read, create, update, share | read allowed within scope; internal create/update only under bounded standing authorisation; share requires approval |
| Gmail | search, read, draft, send | drafts are allowed with bounded authorisation; send requires explicit approval of exact recipients/subject/body/attachments |
| Google Calendar | read, create, update, delete | invite-creating or changing events requires approval; read may be automated |
| GitHub | read, branch, commit, merge, release | branch/commit within authorised repo/branch allowed with bounded authorisation; merge/release require approval |
| External portal | prepare, submit | prepare evidence/draft; submit always needs approval and submission receipt |

Human gates are per concrete action and artifact version. Approvals cannot be inherited from task completion or model validation. Altering recipients, application fields, attachment versions, body or destination invalidates approval.

## Work Control mapping (observed)
Sheets: Focus, Tasks, Workstreams, Calendar, Routines, Links, Legacy, Guide, Sync. Tasks header is row 7, with columns:
A Task ID; B Area; C Workstream; D Action; E Status; F Priority; G Owner; H Hard due; I Planned; J Follow-up; K Hours left; L Next action; M Waiting on; N Depends on ID; O Done when; P Evidence / context; Q Primary link.
Tasks `A:V` are editable, `W:Y` are calculated. Preserve stable IDs. Do not overwrite user-maintained statuses, priorities or dates from source refreshes. Re-read schema before writing: the observed B7 header was contaminated with unrelated prose, which should be resolved before safe automated mapping.
Sync tab currently states `Sources → sheet; no external writes`. Preserve that workflow. Action executor writes and reconciles through its separate `action_queue`, not from Sync cell triggers.
Work Control already has an hourly automation; do not register a duplicate schedule.
Personal workspace compatibility: `workspace-tasks` = `[{title,due,effort,priority,notes}]`; `workspace-updates` = `[{id,due?,priority?,note?}]`. Preserve click-to-Import/Apply rather than silently applying agent output.

## Proposed persistence (additive migration only; inspect actual schema before finalising)
- `workspace_action_queue`: id UUID, owner_user_id UUID, project_id UUID, task_id nullable, connector, action_kind, resource_id, payload_ciphertext/ref, payload_digest, idempotency_key UNIQUE, status, requires_approval, source_manifest JSONB, validation_ref, attempts, provider_result JSONB, created_at, updated_at.
- `workspace_action_approvals`: id UUID, action_id FK, approver_user_id UUID, decision, approved_payload_digest, approved_target, approved_action_kind, decided_at, expires_at, reason.
- `workspace_action_events`: append-only action_id, event_type, actor_type, actor_id, safe_metadata, created_at.
Apply RLS on exposed tables with owner+project authorisation. Never expose API keys, service-role key, OAuth refresh tokens or sensitive source content to agents. Encrypt credential storage and restrict sensitive metadata. Audit log payload references/digests, not full correspondence or beneficiary records.

## Required endpoints (proposed, not yet installed)
- `POST /workspace-action-propose`: authenticated, validated handoff -> proposed action, *no provider write*.
- `GET /workspace-actions`: scoped queue with statuses and evidence pointers.
- `POST /workspace-action-approve`: require logged-in owner and a fixed action digest; store human decision.
- `POST /workspace-action-execute`: server side only, transactionally claim queued action, apply `assessAction`, call exact allowlisted provider operation, verify response, persist outcome. Ensure execution cannot be replayed.
- `POST /workspace-action-reconcile`: provider lookup by stable correlation key when writes have uncertain outcomes.
All endpoint implementations must use established `resolveCaller` patterns, server-side validation and the actual live schema.

## Proposed handoff schema
```json
{
  "contract_version": "1.0",
  "task_id": "TASK-ID",
  "workflow_instance_id": "WORKFLOW-ID",
  "project_id": "PROJECT-ID",
  "owner": "specialist_me_framework",
  "recipient": "validator_indicators",
  "objective": "Deliver a validated result",
  "depends_on": [],
  "inputs": [{"source_id": "S1", "version": "V1", "locator": "URI"}],
  "constraints": [],
  "acceptance_criteria": [],
  "sensitivity": "internal",
  "tool_allowlist": ["google_drive.read"],
  "result": {"artifact_ref": null, "artifact_version": null},
  "evidence": [],
  "assumptions": [],
  "status": "pending",
  "validation": {"status": "not_tested", "checks": [], "reviewer": null},
  "attempt": 0,
  "max_attempts": 2,
  "unresolved_questions": [],
  "human_approval": {"status": "not_requested", "actor": null, "artifact_version": null}
}
```
Adapter envelope only; do not insert these proposed state strings into existing database enums without mapping.

## Approval UX
Review card must show the exact operation, recipient(s), destination, source versions, execution payload preview, attached files, evidence and validation status, and a version-specific Approve/Reject button. Sending email and any external portal submission must *always* enter `awaiting_human`. Show submission receipt / Gmail message ID only after provider confirmation. When payload changes, put the action back in review.

## Quality and safety gates
- Do not treat `qualityAssessment = strong` as validated when it is inferred from attempts.
- Add validators for `product_and_mvp` and `prompt_engineering`; until then show `not_tested`, `review_required=true`.
- Reject unscoped access, unknown projects, old source versions, missing evidence, invalid handoff shape and unsupported routes.
- Never read or store all email threads by default; observe user-specific exclusions (including Goce).
- Protect against spreadsheet formula injection and prompt injection from incoming email/docs/issues.
- Rate-limit actions and calls, set execution budget and default maximum attempts.
- Maintain distinction between proposed, technically validated, actually completed and approved.

## Release sequence
1. Confirm live schema, Supabase project and connector credentials; reconcile branch against current main.
2. Implement queue and approvals migration + restrictive RLS.
3. Add read-only connectors and action proposals; run permission/ownership tests.
4. Add exact-payload human approval UI and audited action execution.
5. Add Google Drive create/update and Gmail draft, then approved Gmail send.
6. Add Calendar mutation and GitHub branch/commit, then gated merge/release.
7. Add browser/portal adapter only where supported, with mandatory exact-submission approval.
8. Run redacted integration tests: cross-project access, payload edit after approval, duplicate provider request, failed/uncertain write, unvalidated specialist, sheet row corruption, conflict between synced and manual edits.

## Current status
This branch contains a pure action policy and Deno unit tests. It does **not** yet have connector executor, OAuth configuration, migration, frontend approval screen, deployed Edge Functions or live tests. No emails, calendar invites, portal applications or other external actions were sent.
