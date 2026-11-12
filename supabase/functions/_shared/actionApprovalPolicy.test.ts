import { assessAction, type ActionRequest, type PolicyContext, type ApprovalEvidence } from "./actionApprovalPolicy.ts";

const base: ActionRequest = {
  id: "action-1", workspaceId: "workspace-1", initiatorUserId: "user-1",
  connector: "gmail", kind: "gmail.send", targetResource: "to:recipient@example.org",
  payloadDigest: "sha256:draft-v1", idempotencyKey: "work-1-email-1",
  validated: true, sourceRefs: ["document-1"], status: "validated",
};
const context: PolicyContext = {
  authenticatedUserId: "user-1", workspaceId: "workspace-1", ownsWorkspace: true,
  operationAllowed: true, standingAuthorisation: true, now: "2026-11-12T10:00:00Z",
};
const approval: ApprovalEvidence = {
  actionId: base.id, workspaceId: base.workspaceId, approverUserId: "user-1",
  approvedPayloadDigest: base.payloadDigest, approvedTargetResource: base.targetResource,
  approvedKind: base.kind, decision: "approved",
  decidedAt: "2026-11-12T09:00:00Z", expiresAt: "2026-11-12T11:00:00Z",
};
function expect(value: boolean, label: string): void {
  if (!value) throw new Error(label);
}
Deno.test("sending email always requires an approval", () => {
  const outcome = assessAction(base, context, null);
  expect(!outcome.permitted && outcome.nextStatus === "awaiting_human", "send gate");
});
Deno.test("valid approval permits execution", () => {
  expect(assessAction(base, context, approval).permitted, "approved send");
});
Deno.test("edited draft invalidates approval", () => {
  expect(!assessAction({...base, payloadDigest: "sha256:draft-v2"}, context, approval).permitted, "digest mismatch");
});
Deno.test("portal submissions are gated", () => {
  const action: ActionRequest = {...base, connector: "portal", kind: "portal.submit"};
  expect(!assessAction(action, context, null).permitted, "portal gate");
});
Deno.test("cross-workspace caller is denied", () => {
  expect(!assessAction(base, {...context, workspaceId: "workspace-2"}, approval).permitted, "cross workspace");
});
Deno.test("mismatched connector is denied", () => {
  expect(!assessAction({...base, connector: "google_drive"}, context, approval).permitted, "connector mismatch");
});
Deno.test("no retry after successful execution", () => {
  expect(!assessAction({...base, status: "succeeded"}, context, approval).permitted, "replay");
});
Deno.test("internal Drive create with standing authorisation is permitted", () => {
  const action: ActionRequest = {...base, connector:"google_drive", kind:"drive.create", status:"validated"};
  expect(assessAction(action, context, null).permitted, "standing authorisation");
});
Deno.test("Drive sharing needs human approval", () => {
  const action: ActionRequest = {...base, connector:"google_drive", kind:"drive.share", status:"validated"};
  expect(!assessAction(action, context, null).permitted, "sharing gate");
});
Deno.test("unvalidated requests may not execute", () => {
  expect(!assessAction({...base, validated:false}, context, approval).permitted, "validator check");
});
