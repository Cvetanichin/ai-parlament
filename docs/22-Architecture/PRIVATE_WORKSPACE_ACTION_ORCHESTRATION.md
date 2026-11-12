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
| Gmail | search, read, create/update drafts | **Draft-only workspace: sending is disabled, even with human approval.** Save addressed drafts with subject, body, attachments and source evidence where authorised |
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
5. Add Google Drive create/update and Gmail draft creation/update. Do **not** implement Gmail send.
6. Add Calendar mutation and GitHub branch/commit, then gated merge/release.
7. Add browser/portal adapter only where supported, with mandatory exact-submission approval.
8. Run redacted integration tests: cross-project access, payload edit after approval, duplicate provider request, failed/uncertain write, unvalidated specialist, sheet row corruption, conflict between synced and manual edits.

## Principal knowledge-work workflows (priority order)
These are the primary workspace outcomes. Connector actions serve them, not the other way around.

| Workflow | Specialist responsibility | Input sources | Primary output | Quality gates | Destination |
|---|---|---|---|---|---|
| EMAIL_DRAFT | Research relevant thread, extract decisions, compose reply or new email **without sending** | Scoped Gmail thread, task, approved references | Gmail Draft with addressees, subject, reply-thread reference, attachments if applicable | Factual accuracy, correct recipients/thread, tone, confidentiality, no fabricated commitments | Gmail Drafts; Work Control task gets draft link |
| PROJECT_PROPOSAL_DRAFT | Review call eligibility, donor guidelines, approved concept and previous drafts; produce proposal sections | Call documents, donor templates, project evidence | Versioned application/concept note and logframe/budget handoff | Eligibility, results chain, evidence, donor compliance, cross-document consistency; missing data visibly flagged | Google Drive; linked Work Control task |
| RESEARCH_BRIEF | Develop research question, retrieve primary sources, evaluate quality and synthesise evidence | Scope, timeframe, documents, verifiable web sources | Source register, findings and decision-ready brief | Source freshness, citation fidelity, uncertainty, counterevidence | Google Docs/Drive |
| DATA_ANALYSIS | Validate source data and grain; analyse trends and drivers; generate reproducible calculations and visuals | CSV/XLSX/Sheets, definitions, KPI specifications | Analysis report, tables, charts, limitations and code/query provenance | Schema, missingness, duplicates, arithmetic and method checks | Google Sheets/Drive |
| DONOR_REPORT | Compare achievements against approved indicators, budgets and source evidence | Logframe, activity records, financials, reports | Narrative/results report with annexes and evidence matrix | No invented achievements, indicator consistency, variance explanations, donor template compliance | Google Docs/Drive |

Every workflow receives: task ID, objective, one owner, authoritative source manifest, constraints, acceptance criteria, sensitivity, deliverable location and validator. The formatter cannot silently change validated substance. For drafts, technical completion does not mean content approval, and no email is sent.

Default pipeline: `Work Control -> Prime Minister -> source/context loader -> specialist(s) -> Opposition & Compliance validator -> formatter -> Draft/Drive output -> provenance log -> Work Control update`.
Use independent document research and data analysis workers only when the deliverable requires them. Proposal and reporting workflows must be blocked on conflicting authoritative source versions, not guessed around.

### Gmail draft action contract
- `gmail.draft` only: method `create` or `update`; destination mailbox and intended thread explicitly specified.
- The executor must not include Gmail `messages.send`, `drafts.send` or any equivalent send endpoint in its capability allowlist.
- On draft save, record provider draft ID, thread ID, last modified time and source task ID.
- Update an existing draft only when its current message/thread identity is verified, otherwise create a separate draft and flag conflict.
- Respect user exclusions when searching email. Confirm attachments and recipient addresses against sources; do not invent addresses.
- Manual user sending from Gmail itself remains outside the automation.

### Minimum acceptance tests
1. A scoped email task results in a Gmail Drafts item, with no sent message.
2. `gmail.send` action is denied despite a valid approval record.
3. A proposal is drafted into the correct Drive destination without portal submission.
4. Research claims can be traced to a source register and dates.
5. Analysis identifies missing data and does not manufacture a baseline.
6. A donor report is marked `needs_review` when outputs and logframe indicators conflict.
7. A successful draft returns provider evidence and a Work Control Task ID update, preserving existing statuses and user-maintained dates.


## Final owner decisions: 12 November 2026 (binding v1 scope)
1. **Proactive initiation**: Discover candidate work from scoped Work Control tasks, Gmail, Calendar, Drive and GitHub. Proposals are deduplicated by provider source ID plus project identity, not by subject alone. They must not silently trigger an external operation.
2. **Review all outputs**: Every generated email draft, proposal, research output, data analysis or report remains `ready_for_review` until the human executive explicitly reviews the saved artifact. Quality validation and human review are separate. Substantive edits invalidate the prior review.
3. **Existing destinations**: Save document drafts to the existing authorised client/project Drive folder. No fallback to My Drive root and no new central workspace folder. An unknown or ambiguous folder results in a blocked deliverable requiring destination resolution.

## Added pure-code modules in this branch
- `supabase/functions/_shared/privateWorkspacePolicy.ts`: frozen private preferences; safe task candidate proposal/deduplication; reviewed-draft destination rules; separate explicit submission approval.
- `supabase/functions/_shared/privateWorkspacePolicy.test.ts`: Deno tests for exclusions, candidate limits, duplicate proposals, approved folder mapping and review gates.
- `supabase/functions/_shared/actionApprovalPolicy.ts`: Gmail send is forbidden, including with an approval token; allowlisted Gmail draft creation is separate. No connector calls are made by this module.
- `supabase/functions/_shared/actionApprovalPolicy.test.ts`: email draft/send and action gate cases.

## Implementation backlog: sequential, acceptance-tested
| Order | Work item | Change boundary | Acceptance |
|---|---|---|---|
| 1 | Review branch and execute policy unit tests | Test only | No Gmail send path; unknown folders blocked; unvalidated work excluded |
| 2 | Inspect live Supabase schemas and current workflow routes | Read-only | DB column/enums/RLS mapped, no competing orchestration engine |
| 3 | Create additive action queue and review ledger migration | Feature branch, migration only | Owner-scoped RLS, append-only events, idempotent action status transitions |
| 4 | Work Control ingestion adapter | Read-only first | Preserve Task IDs and A:V mapped fields; detect malformed B7 header; never modify W:Y calculations |
| 5 | Proactive discovery | Candidate-only | Bounded Gmail/Calendar/Drive/GitHub context, user exclusions respected, duplicate suppression, no email sends |
| 6 | Gmail Drafts adapter | Bounded write | Save and verify draft ID/thread, never call send endpoint |
| 7 | Document workflows and Drive adapter | Bounded write | Proposal/research/analysis/report drafts saved to authorised existing folders and linked to task |
| 8 | Validators for all activated workflows | Prompt-and-test | Every artifact gets explicit source provenance, independent validation and post-format check |
| 9 | Review interface | App implementation | Every draft surfaced for human review; approvals tied to exact artifact version |
| 10 | Work Control write-back and reconciliation | Controlled write | Stable Task ID, evidence link, preserve user-managed status, no duplicate hourly sync |
| 11 | Pilot and release checks | Test only before deploy | No external communications, no unreviewed document labelled final, failure/retry audit complete |

No production deployment is authorised by these decisions alone. Sending emails remains disabled. Portal submission requires a separate specific human approval even after a document has been reviewed.

## Implementation checkpoint, 12 November 2026

Read-only staging inspection confirmed that the Gmail queue and event ledger exist with RLS enabled. The queue contained zero actions. The deployed workspace-gmail-draft function was active at version 2 with JWT verification enabled. Its save path records provider evidence and sets ready_for_review. These observations establish deployment state only.

Branch policy now rejects blank discovery identities or source evidence and rejects root, blank, padded or ambiguous Drive folder mappings. All 28 focused Deno tests passed locally, including Gmail mock calls. No staging write or provider call was needed.

Next steps in order:

1. Test staging ownership and project isolation with synthetic identities. Check workflow-instance project binding and mailbox ownership before any Gmail pilot.
2. Verify proposal/execute digest stability across a JSONB round trip, atomic audit writes, and uncertain-result reconciliation using synthetic records and a mock provider.
3. Connect bounded discovery to the proposal queue. Implement Drive metadata verification for mapped folder IDs (existing folder, expected project destination, accessible and not trashed) before activating writes.
4. Implement human review tied to the saved artifact version, including invalidation on substantive edits. Work Control write-back and production deployment remain pending.
