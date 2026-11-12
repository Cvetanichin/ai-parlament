# Gmail Drafts staging integration and test handoff

Status: staging v2 deployed 12 November 2026. **Not production-ready or end-to-end verified.**
Repository PR: https://github.com/Cvetanichin/ai-parlament/pull/32
Staging Supabase project ref: `dgwdtaoozlqfxgynrvkr`
Function: `workspace-gmail-draft` (JWT verification enabled)

## Scope and relationship to Parliament Core
- Persist draft actions in `public.workspace_action_queue` with optional existing `workflow_instance_id`, required `project_id` and existing organisation membership via `resolveCaller`.
- Store safe audit references in `workspace_action_events`.
- Endpoint accepts `{operation:"propose",projectId,idempotencyKey,sourceRefs,draft,workflowInstanceId?,workControlTaskId?}` and `{operation:"execute",projectId,actionId}`.
- Creates **new Gmail drafts only**; does not yet update existing drafts or preserve reply threading. Reply-to-thread support needs a separate proven contract.
- Automatic enqueue from the main `prompt-orchestration-run` agent output is not wired. Initially the caller must explicitly propose/execute a Gmail draft action.
- Syntactic draft validation is performed server-side. No independent semantic/source-fidelity validation is currently wired to this email route; all outputs remain for human review.
- The provider adapter can call only `GET users/me/profile` and `POST users/me/drafts`. There is no Gmail send operation or route. An internal policy also disables `gmail.send`.

## Environment prerequisites (do not put values in GitHub)
The Supabase staging project needs `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, and `GMAIL_ALLOWED_EMAIL`, provisioned through the server's approved secrets mechanism. Use an OAuth grant for the dedicated authorised mailbox, minimum `https://www.googleapis.com/auth/gmail.compose` scope; note that this Google scope technically also allows sending, so enforce code-level refusal and monitor provider actions. The Gmail access token is fetched server-side and compared against the configured mailbox profile.

The staging project also needs a **real authenticated test user with project and organisation membership**. As checked on 12 November 2026, the staging database has zero projects and zero organisation members. Do not fabricate membership, passwords or personal mail OAuth credentials.

## Automated checks
GitHub Actions:
- `Private workspace draft-only policy tests`: passed.
- `Deno` general repository checks: passed after lint fixes.
- Policy/Gmail mock suite: 26 tests pass, including no Gmail send, MIME envelope, header injection, mailbox mismatch, excluded discovery candidates and cross-workspace denial.
- Staging security SQL: six checks passed for owner read policy, blocked client writes and Gmail-draft-only database constraint.

## Manual end-to-end acceptance test (NOT YET RUN)
1. Log in as the authorised staging user with a valid user JWT, `projectId` and project membership.
2. Propose a simple test draft using source refs and a unique idempotency key. Do not include real confidential content.
3. Verify the queue row is `validated`, provider = `gmail`, action_kind = `gmail.draft`, review_status = `not_reviewed`.
4. Execute once. Verify returned Gmail draft ID using the authorised mailbox's Drafts folder; verify no email exists in Sent.
5. Execute the same action again. Verify the response reports `reused=true` and no duplicate draft is created.
6. Attempt to propose using the same idempotency key with changed content. Expect HTTP 409.
7. Verify wrong or expired token, wrong project membership, mailbox mismatch and absent secrets fail closed.
8. Verify audit events and Work Control correspondence. The link-back adapter is still pending.
9. Never run a portal submission or Gmail send as part of the test.

## Known limitations and pre-release gaps
- No authenticated live Gmail test; staging is empty and mailbox OAuth secrets not confirmed.
- No authenticated staging user provisioning or end-user OAuth installation flow.
- No queue executor reconciliation for a provider success followed by database failure. Such actions deliberately remain `executing` and must be reviewed manually before a retry.
- No existing Gmail draft update or reply thread mode, no attachments in adapter.
- No automatic proposal generation from live correspondence, no sync-back to Work Control, no review UI.
- No production deployment or production data migration.
- Keep PR draft until end-to-end verification and security review.

## Safety and testing decisions
Every email remains a draft for human review. Portal submissions require a separate explicit approval, never inferred from reviewing a document. No unapproved external communications are performed.
