/**
 * Private workspace action policy, v1.
 * Pure functions only: this module DOES NOT authorise a request, send an email,
 * call an integration or write to the database.
 *
 * Approval evidence must be loaded by a trusted server after validating the
 * authenticated user and checking the action record belongs to their workspace.
 * Never accept approval evidence from a model-generated payload or browser body.
 */
export type Connector = "google_drive" | "gmail" | "google_calendar" | "github" | "portal";
export type ActionKind =
  | "drive.read" | "drive.create" | "drive.update" | "drive.share"
  | "gmail.read" | "gmail.draft" | "gmail.send"
  | "calendar.read" | "calendar.create" | "calendar.update" | "calendar.delete"
  | "github.read" | "github.branch" | "github.commit" | "github.merge" | "github.release"
  | "portal.prepare" | "portal.submit";

export type ActionStatus =
  | "proposed" | "validated" | "awaiting_human" | "approved"
  | "executing" | "succeeded" | "failed" | "blocked";

export interface ActionRequest {
  id: string;
  workspaceId: string;
  initiatorUserId: string;
  connector: Connector;
  kind: ActionKind;
  targetResource: string;
  // Stable SHA-256 of canonicalised execution payload, generated server-side.
  payloadDigest: string;
  idempotencyKey: string;
  validated: boolean;
  sourceRefs: string[];
  status: ActionStatus;
}

export interface ApprovalEvidence {
  actionId: string;
  workspaceId: string;
  approverUserId: string;
  approvedPayloadDigest: string;
  approvedTargetResource: string;
  approvedKind: ActionKind;
  decision: "approved" | "rejected";
  decidedAt: string;
  expiresAt: string;
}

export interface PolicyContext {
  authenticatedUserId: string;
  workspaceId: string;
  // Decided on trusted server, not by an LLM or the client.
  ownsWorkspace: boolean;
  // Concrete per-user and per-resource permissions verified server-side.
  operationAllowed: boolean;
  // True only for pre-approved, bounded automated write operations.
  standingAuthorisation: boolean;
  now: string;
}

const KIND_CONNECTOR: Record<ActionKind, Connector> = {
  "drive.read": "google_drive", "drive.create": "google_drive",
  "drive.update": "google_drive", "drive.share": "google_drive",
  "gmail.read": "gmail", "gmail.draft": "gmail", "gmail.send": "gmail",
  "calendar.read": "google_calendar", "calendar.create": "google_calendar",
  "calendar.update": "google_calendar", "calendar.delete": "google_calendar",
  "github.read": "github", "github.branch": "github",
  "github.commit": "github", "github.merge": "github",
  "github.release": "github",
  "portal.prepare": "portal", "portal.submit": "portal",
};

/** Any external communication, submission, sharing or publication is gated. */
export const HUMAN_GATE_REQUIRED = new Set<ActionKind>([
  "gmail.send", "portal.submit", "drive.share",
  "calendar.create", "calendar.update", "calendar.delete",
  "github.merge", "github.release",
]);

export interface GateDecision {
  permitted: boolean;
  requiresHuman: boolean;
  nextStatus: ActionStatus;
  reason:
    | "ready" | "approval_required" | "approval_invalid"
    | "unauthorised" | "invalid_action" | "validation_required"
    | "already_executing_or_finished" | "not_ready";
}

export function assessAction(
  action: ActionRequest,
  context: PolicyContext,
  approval: ApprovalEvidence | null,
): GateDecision {
  const deny = (reason: GateDecision["reason"], nextStatus: ActionStatus = "blocked"): GateDecision =>
    ({ permitted: false, requiresHuman: HUMAN_GATE_REQUIRED.has(action.kind), nextStatus, reason });

  if (!context.ownsWorkspace || !context.operationAllowed ||
      action.workspaceId !== context.workspaceId ||
      action.initiatorUserId !== context.authenticatedUserId) return deny("unauthorised");
  if (KIND_CONNECTOR[action.kind] !== action.connector ||
      !action.id || !action.targetResource || !action.payloadDigest ||
      !action.idempotencyKey) return deny("invalid_action");
  if (!action.validated) return deny("validation_required");
  if (action.status === "succeeded" || action.status === "executing") return deny("already_executing_or_finished");
  if (!["validated", "awaiting_human", "approved"].includes(action.status)) return deny("not_ready");

  const requiresHuman = HUMAN_GATE_REQUIRED.has(action.kind);
  if (requiresHuman) {
    if (!approval) return deny("approval_required", "awaiting_human");
    const approvedAt = Date.parse(approval.decidedAt);
    const expiresAt = Date.parse(approval.expiresAt);
    const now = Date.parse(context.now);
    const valid = approval.decision === "approved" &&
      approval.actionId === action.id &&
      approval.workspaceId === action.workspaceId &&
      approval.approverUserId === context.authenticatedUserId &&
      approval.approvedPayloadDigest === action.payloadDigest &&
      approval.approvedTargetResource === action.targetResource &&
      approval.approvedKind === action.kind &&
      Number.isFinite(approvedAt) && Number.isFinite(expiresAt) && Number.isFinite(now) &&
      approvedAt <= now && now < expiresAt;
    if (!valid) return deny("approval_invalid", "awaiting_human");
  } else if (!context.standingAuthorisation) {
    // Even low-risk writes need explicit bounded standing authorisation
    // or a fresh action-specific approval.
    const valid = approval?.decision === "approved" &&
      approval.actionId === action.id &&
      approval.workspaceId === action.workspaceId &&
      approval.approverUserId === context.authenticatedUserId &&
      approval.approvedPayloadDigest === action.payloadDigest &&
      approval.approvedTargetResource === action.targetResource &&
      approval.approvedKind === action.kind &&
      Date.parse(approval.decidedAt) <= Date.parse(context.now) &&
      Date.parse(context.now) < Date.parse(approval.expiresAt);
    if (!valid) return deny("approval_required", "awaiting_human");
  }
  return { permitted: true, requiresHuman, nextStatus: "executing", reason: "ready" };
}
