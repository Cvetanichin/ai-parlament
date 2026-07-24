import { supabase } from "@/lib/supabase";
import { callEdgeFunction, callEdgeFunctionGet, ApiError } from "@/lib/api";

export type CategoryStatus = "pass" | "warning" | "fail";
export type EligibilityRecommendation = "go" | "no_go" | "needs_review";

export interface EligibilityReport {
  id: string;
  operationalCapacityStatus: CategoryStatus | null;
  financialCapacityStatus: CategoryStatus | null;
  geographicEligibilityStatus: CategoryStatus | null;
  consortiumRequirementsStatus: CategoryStatus | null;
  budgetCeilingFitStatus: CategoryStatus | null;
  riskFlags: string[];
  recommendation: EligibilityRecommendation | null;
  createdAt: string;
}

interface EligibilityReportRow {
  id: string;
  operational_capacity_status: CategoryStatus | null;
  financial_capacity_status: CategoryStatus | null;
  geographic_eligibility_status: CategoryStatus | null;
  consortium_requirements_status: CategoryStatus | null;
  budget_ceiling_fit_status: CategoryStatus | null;
  risk_flags: string[] | null;
  recommendation: EligibilityRecommendation | null;
  created_at: string;
}

function mapReport(row: EligibilityReportRow): EligibilityReport {
  return {
    id: row.id,
    operationalCapacityStatus: row.operational_capacity_status,
    financialCapacityStatus: row.financial_capacity_status,
    geographicEligibilityStatus: row.geographic_eligibility_status,
    consortiumRequirementsStatus: row.consortium_requirements_status,
    budgetCeilingFitStatus: row.budget_ceiling_fit_status,
    riskFlags: row.risk_flags ?? [],
    recommendation: row.recommendation,
    createdAt: row.created_at,
  };
}

// Grant Studio's real gate/agent-invocation machinery (workflow_instances,
// agent_runs via invokeAgent) was built (ADR-0007, Phase 1) anchored on
// `projects`, not `proposals` -- agent_runs.project_id is a NOT NULL FK, and
// eligibility-report-run/-get + workflow-gate-decide all resolve the
// caller's organisation via a `projects` row (auth.ts's resolveCaller).
// projects.stage explicitly allows 'pre_award' (its CHECK constraint is
// ARRAY['pre_award','post_award']), confirming a project is meant to exist
// from proposal-start, not only after award -- this ensures/looks up that
// pre-award project rather than inventing a parallel mechanism, keyed by
// (organisation_id, opportunity_id) since that pair is 1:1 in practice
// (Product Vision §2's single-Organisation-at-v1 framing).
export async function ensureProjectForOpportunity(
  organisationId: string,
  opportunityId: string,
  opportunityTitle: string,
  userId: string,
): Promise<string> {
  const existing = await supabase
    .from("projects")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data.id;

  const created = await supabase
    .from("projects")
    .insert({
      organisation_id: organisationId,
      opportunity_id: opportunityId,
      name: opportunityTitle,
      stage: "pre_award",
      created_by: userId,
    })
    .select("id")
    .single();
  if (created.error) throw created.error;
  return created.data.id;
}

export async function fetchEligibilityReport(projectId: string, opportunityId: string): Promise<EligibilityReport | null> {
  try {
    const row = await callEdgeFunctionGet<EligibilityReportRow>("eligibility-report-get", { projectId, opportunityId });
    return mapReport(row);
  } catch (err) {
    if (err instanceof ApiError && err.code === "not_found") return null;
    throw err;
  }
}

// eligibility-report-run's own response is NOT the eligibility_reports row
// shape -- eligibilityEngine.ts's runEligibilityCheck() returns
// { id, organisationId, opportunityId, categoryStatus: {...}, riskFlags,
// recommendation }, a nested-object shape distinct from the flat
// operational_capacity_status/etc. columns eligibility-report-get's plain
// `.select("*")` returns. Rather than maintain two parallel mappers for
// what's the same underlying row, just re-fetch via GET after the run
// completes -- confirmed correct by inspecting both endpoints' real source.
export async function runEligibilityCheck(projectId: string, opportunityId: string): Promise<EligibilityReport> {
  await callEdgeFunction<unknown>("eligibility-report-run", { projectId, opportunityId });
  const report = await fetchEligibilityReport(projectId, opportunityId);
  if (!report) throw new Error("eligibility-report-run succeeded but no report could be fetched back");
  return report;
}

export type WorkflowInstanceState =
  | "pending"
  | "running"
  | "awaiting_human"
  | "veto_failed"
  | "rewriting"
  | "escalated"
  | "completed"
  | "failed"
  | "cancelled";

export interface WorkflowInstance {
  id: string;
  state: WorkflowInstanceState;
  voteOfNoConfidenceCount: number;
}

// Named for its Phase C origin, but generic in practice: this is THE one
// continuous Workflow Instance per proposal (go_no_go -> writing -> polish
// -> submission all share it, per workflowEngine.ts's real, built state
// machine) -- Phase D's governance-loop step reuses the exact same fetch.
export async function fetchGoNoGoInstance(organisationId: string, projectId: string): Promise<WorkflowInstance | null> {
  const { data, error } = await supabase
    .from("workflow_instances")
    .select("id, state, vote_of_no_confidence_count")
    .eq("organisation_id", organisationId)
    .eq("target_type", "project")
    .eq("target_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, state: data.state as WorkflowInstanceState, voteOfNoConfidenceCount: data.vote_of_no_confidence_count };
}

// Direct inserts, not an Edge Function call -- docs/13-Frontend §2: RLS
// alone already enforces this correctly (workflow_instances_insert/
// workflow_instance_history_insert are both organisation-scoped WITH
// CHECK policies), and there is no cross-service orchestration here, just
// row creation -- mirrors startInstance() in _shared/workflowEngine.ts
// exactly (that function is never exposed through any edge function; it's
// only called internally by prompt-orchestration-run today).
export async function startGoNoGoInstance(organisationId: string, projectId: string): Promise<string> {
  const { data: definition, error: defErr } = await supabase
    .from("workflow_definitions")
    .select("id")
    .eq("name", "Governance Loop")
    .single();
  if (defErr || !definition) throw new Error("Governance Loop workflow definition not found");

  const { data: instance, error: instanceErr } = await supabase
    .from("workflow_instances")
    .insert({
      organisation_id: organisationId,
      workflow_definition_id: definition.id,
      target_type: "project",
      target_id: projectId,
      state: "running",
    })
    .select("id")
    .single();
  if (instanceErr) throw instanceErr;

  const { error: historyErr } = await supabase
    .from("workflow_instance_history")
    .insert({ workflow_instance_id: instance.id, state: "running", reason: "instance created" });
  if (historyErr) throw historyErr;

  return instance.id;
}

export interface ResearchResult {
  score: number;
  recommendation: "GO" | "CONDITIONAL" | "NO-GO";
  eligibilityFlags: string[];
  risks: string[];
}

interface WorkflowResearchRunResponse {
  workflowInstanceId: string;
  result: ResearchResult;
  agentRunId: string;
  governanceMode: string;
}

// Runs the Research Ministry's Go/No-Go Risk Matrix -- the step that
// transitions the instance from "running" to "awaiting_human", which is
// the hard precondition decideGate() enforces before ANY gate (including
// go_no_go) can be decided. Not optional/deferrable: without this, the
// Go/No-Go gate is simply never reachable.
export async function runResearch(workflowInstanceId: string, projectId: string, brief: string): Promise<ResearchResult> {
  const res = await callEdgeFunction<WorkflowResearchRunResponse>("workflow-research-run", {
    workflowInstanceId,
    projectId,
    brief,
    constraints: { characterLimit: 4000, requiredKeywords: [] },
  });
  return res.result;
}

// Reload-resilience: the Research result isn't otherwise persisted
// anywhere queryable except inside this audit_events row's `detail.output`
// (the same place decideGate()'s own getResearchRecommendation reads it
// from) -- read it directly so the Risk Matrix survives a page refresh
// instead of only existing in the mutation's in-memory result.
export async function fetchResearchResult(workflowInstanceId: string): Promise<ResearchResult | null> {
  const { data, error } = await supabase
    .from("audit_events")
    .select("detail")
    .eq("target_id", workflowInstanceId)
    .eq("action", "feasibility_assessment")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const output = (data?.detail as { output?: ResearchResult } | undefined)?.output;
  return output ?? null;
}

export interface VetoCheckResult {
  pass: boolean;
  failures: string[];
}

export interface VetoChecks {
  deterministic: VetoCheckResult;
  lexical: VetoCheckResult;
  semantic: VetoCheckResult;
}

export interface GovernanceResult {
  draft: string | null;
  vetoPassed: boolean;
  vetoChecks: VetoChecks | null;
  attempts: number;
  confidence: "high" | "medium" | "low";
}

// Runs the Writing Ministry -> Tripartite Veto Engine -> Vote of No
// Confidence loop (runGovernanceLoop) -- the real drafting mechanism for
// Grant Studio, not prompt-orchestration-run (a separate system for the
// three Prompt Orchestration Platform domains, unrelated to Grant Studio
// proposal writing). Requires the instance to already be past the Go/No-Go
// gate (state 'running', not 'awaiting_human') -- workflow-governance-run
// 409s otherwise.
export async function runGovernanceDraft(workflowInstanceId: string, projectId: string, brief: string): Promise<GovernanceResult> {
  return callEdgeFunction<GovernanceResult>("workflow-governance-run", {
    workflowInstanceId,
    projectId,
    brief,
    constraints: { characterLimit: 4000, requiredKeywords: [] },
  });
}

// Reload-resilience, same rationale as fetchResearchResult: the veto
// result isn't stored anywhere else queryable except this audit_events
// row's detail (written by runGovernanceLoop's writeAuditEvent call).
export async function fetchVetoResult(workflowInstanceId: string): Promise<{ vetoChecks: VetoChecks; pass: boolean } | null> {
  const { data, error } = await supabase
    .from("audit_events")
    .select("detail")
    .eq("target_id", workflowInstanceId)
    .eq("action", "veto_result")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const detail = data?.detail as { checks?: VetoChecks; pass?: boolean } | undefined;
  if (!detail?.checks) return null;
  return { vetoChecks: detail.checks, pass: Boolean(detail.pass) };
}

export type ExpectedGate = "go_no_go" | "polish" | "submission";

// Mirrors decideGate()'s own getExpectedGateType server-side exactly
// (workflowEngine.ts): the most recent of feasibility_assessment/veto_result/
// an approved polish gate_decision determines what's pending next. Needed
// because state alone is ambiguous -- 'awaiting_human' means "awaiting
// Go/No-Go" before any research has run, "awaiting Polish" after the
// governance loop, and "awaiting Submission" after Polish is approved, and
// the UI must not keep offering an already-decided gate (confirmed live:
// without this, the Polish Gate card kept rendering, Approve-able, even
// after Polish had already been approved and the instance had moved on to
// awaiting Submission -- decideGate would 409 gate_precondition_unmet if
// acted on, but the UI itself was stale/wrong).
export async function fetchExpectedGate(workflowInstanceId: string): Promise<ExpectedGate | null> {
  const { data, error } = await supabase
    .from("audit_events")
    .select("action, detail")
    .eq("target_id", workflowInstanceId)
    .in("action", ["feasibility_assessment", "veto_result", "gate_decision"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.action === "feasibility_assessment") return "go_no_go";
  if (data.action === "veto_result") return "polish";
  if (data.action === "gate_decision") {
    const detail = data.detail as { gateType?: ExpectedGate; decision?: string } | null;
    if (detail?.gateType === "polish" && detail?.decision === "approved") return "submission";
  }
  return null;
}

// Domain-Model-Specification-v1.0.md's own vocabulary: "proposal status is
// freeform, driven by Workflow Instance state." Mirrors the instance's
// state onto proposals.status at each real transition so the field isn't
// frozen at its Phase B creation-time value ("pending") forever.
export async function syncProposalStatus(proposalId: string, status: string): Promise<void> {
  const { error } = await supabase.from("proposals").update({ status }).eq("id", proposalId);
  if (error) throw error;
}
