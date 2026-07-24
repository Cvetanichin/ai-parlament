import type { ReactNode } from "react";

export type GateType = "go_no_go" | "polish" | "submission";
export type GateDecision = "approved" | "rejected";

// The frontend expression of Parliament Core §2.4's Gate Request record
// (docs/13-Frontend §4) -- this component renders whatever the record
// contains, it does not independently decide what a gate needs to show.
export interface GateRequest {
  workflowInstanceId: string;
  projectId: string;
  gateType: GateType;
  title: string;
  // The artefact under review (a proposal section, a logframe, a
  // submission package) -- caller-rendered, since its shape differs per
  // gate and this component has no opinion on it.
  artefact: ReactNode;
  // Compliance Findings / Eligibility Report / Veto verdict feeding the
  // decision -- also caller-rendered for the same reason.
  supportingRecords?: ReactNode;
  // Security spec §2.2: owner/admin-only gate, Compliance Override
  // requires a justification. True when this specific decision is known
  // in advance to be an override (e.g. approving against a NO-GO
  // recommendation); the component also reacts to the server's
  // override_justification_required error for cases not known up front.
  knownOverride?: boolean;
}

// Matches workflow-gate-decide's real response body exactly
// ({ ...decideGateResult, governanceMode }) -- decideGate() returns
// { instanceId, gateType, state, wasOverride }, not `status` (an earlier
// version of this type had that wrong; nothing read the field until Phase D
// needed the real post-decision state to sync proposals.status with it).
export interface GateDecisionResult {
  instanceId: string;
  gateType: GateType;
  state: string;
  wasOverride: boolean;
  governanceMode: string;
}
