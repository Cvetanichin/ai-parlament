// Workflow Engine — Layer 3 (Parliament Core spec §2). Owns *sequencing*:
// state machine, the Vote of No Confidence sub-workflow (§2.3), and Human
// Gate integration (§2.4). Ported from the real MVP's pmAgent.js
// (runGovernanceLoop, runResearchPhase) and humanGates.js (decide),
// confirmed against real source (Parliament Core spec §0) — the loop
// structure below matches the original almost verbatim, re-expressed
// against the real workflow_instances/workflow_instance_history tables
// instead of an in-memory proposal object.
import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { invokeAgent } from "./agentRuntime.ts";
import { buildPrompt as buildResearchPrompt, mockRun as mockResearchRun, parseResponse as parseResearchResponse } from "./ministries/research.ts";
import { buildPrompt as buildWritingPrompt, mockDraft } from "./ministries/writing.ts";
import { runVeto, VetoConstraints } from "./vetoEngine.ts";

export type WorkflowState =
  | "pending"
  | "running"
  | "awaiting_human"
  | "veto_failed"
  | "rewriting"
  | "escalated"
  | "completed"
  | "failed"
  | "cancelled";

async function transition(
  supabase: SupabaseClient,
  instanceId: string,
  state: WorkflowState,
  reason: string,
): Promise<void> {
  const { error: updateErr } = await supabase
    .from("workflow_instances")
    .update({ state, updated_at: new Date().toISOString() })
    .eq("id", instanceId);
  if (updateErr) throw updateErr;

  const { error: historyErr } = await supabase
    .from("workflow_instance_history")
    .insert({ workflow_instance_id: instanceId, state, reason });
  if (historyErr) throw historyErr;
}

async function writeAuditEvent(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    actorType: "agent" | "human" | "system";
    actorId?: string | null;
    action: string;
    targetType?: string;
    targetId?: string;
    agentRunId?: string | null;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  await supabase.from("audit_events").insert({
    organisation_id: params.organisationId,
    actor_type: params.actorType,
    actor_id: params.actorId ?? null,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId,
    agent_run_id: params.agentRunId ?? null,
    detail: params.detail ?? {},
  });
}

export interface StartInstanceParams {
  supabase: SupabaseClient;
  organisationId: string;
  workflowDefinitionId: string;
  targetType: string;
  targetId: string;
}

export async function startInstance(params: StartInstanceParams): Promise<string> {
  const { supabase, organisationId, workflowDefinitionId, targetType, targetId } = params;
  const { data, error } = await supabase
    .from("workflow_instances")
    .insert({
      organisation_id: organisationId,
      workflow_definition_id: workflowDefinitionId,
      target_type: targetType,
      target_id: targetId,
      state: "running",
    })
    .select("id")
    .single();
  if (error) throw error;
  await supabase.from("workflow_instance_history").insert({
    workflow_instance_id: data.id,
    state: "running",
    reason: "instance created",
  });
  return data.id;
}

// Research phase — Parliament Core §4 Interaction Model, pmAgent.js's
// runResearchPhase. Advisory input for the human at the Go/No-Go gate; it
// never auto-approves or auto-rejects anything itself.
export interface RunResearchParams {
  supabase: SupabaseClient;
  instanceId: string;
  organisationId: string;
  projectId: string;
  brief: string;
  donorGuidelines?: string;
  constraints: VetoConstraints;
}

export async function runResearchPhase(params: RunResearchParams) {
  const { supabase, instanceId, organisationId, projectId, brief, donorGuidelines, constraints } = params;

  const result = await invokeAgent({
    supabase,
    agentSlug: "research_ministry",
    projectId,
    organisationId,
    input: { brief, donorGuidelines, constraints },
    buildPrompt: (i) => buildResearchPrompt(i as any),
    mockRun: (i) => mockResearchRun(i as any),
    parseResponse: (raw) => parseResearchResponse(raw),
  });

  await writeAuditEvent(supabase, {
    organisationId,
    actorType: "agent",
    action: "feasibility_assessment",
    targetType: "workflow_instance",
    targetId: instanceId,
    agentRunId: result.agentRunId,
    detail: { output: result.output },
  });

  // Go/No-Go Risk Matrix ready — human decision required (Human Gate 2).
  await transition(supabase, instanceId, "awaiting_human", "Go/No-Go Risk Matrix ready — human decision required");

  return result;
}

// Governance loop — pmAgent.js's runGovernanceLoop, re-expressed as the
// Vote of No Confidence sub-workflow (Parliament Core §2.3): Writing drafts
// -> Veto Engine checks -> on fail, forced context reset + error log
// injection + rewrite, capped at the Workflow Definition's threshold, then
// escalate. Confidence heuristic per §2.3.2, confirmed against real code.
export interface RunGovernanceLoopParams {
  supabase: SupabaseClient;
  instanceId: string;
  organisationId: string;
  projectId: string;
  brief: string;
  constraints: VetoConstraints;
  voteOfNoConfidenceThreshold: number;
}

export async function runGovernanceLoop(params: RunGovernanceLoopParams) {
  const { supabase, instanceId, organisationId, projectId, brief, constraints, voteOfNoConfidenceThreshold } = params;

  let errorLog: string[] | null = null;
  let attempt = 0;
  let vetoResult;
  let draftResult;

  await transition(supabase, instanceId, "running", "Writing ministry dispatched");

  while (attempt < voteOfNoConfidenceThreshold) {
    attempt += 1;

    if (attempt > 1) {
      // Vote of No Confidence: forced context reset (no prior draft carried
      // forward, only the structured error log) + error log injection.
      await supabase
        .from("workflow_instances")
        .update({ vote_of_no_confidence_count: attempt - 1 })
        .eq("id", instanceId);
      await transition(
        supabase,
        instanceId,
        "rewriting",
        `Vote of No Confidence attempt ${attempt}: forced context reset, error log injected`,
      );
    }

    draftResult = await invokeAgent({
      supabase,
      agentSlug: "writing_ministry",
      projectId,
      organisationId,
      input: { brief, constraints, errorLog },
      buildPrompt: (i) => buildWritingPrompt(i as any),
      mockRun: (i) => mockDraft(i as any),
    });

    const draft = String(draftResult.output);

    vetoResult = await runVeto({ supabase, draft, constraints, brief, projectId, organisationId });

    await writeAuditEvent(supabase, {
      organisationId,
      actorType: "agent",
      action: "veto_result",
      targetType: "workflow_instance",
      targetId: instanceId,
      agentRunId: draftResult.agentRunId,
      detail: { attempt, pass: vetoResult.pass, checks: vetoResult.checks, draft },
    });

    if (vetoResult.pass) break;

    errorLog = vetoResult.failures;
    await transition(supabase, instanceId, "veto_failed", `Attempt ${attempt} failed veto: ${errorLog.join("; ")}`);
  }

  // Confidence heuristic (§2.3.2): high if passed on attempt 1, medium if
  // passed after one or more Vote of No Confidence cycles, low if never
  // passed within the threshold.
  const confidence = vetoResult!.pass ? (attempt === 1 ? "high" : "medium") : "low";

  if (!vetoResult!.pass) {
    await transition(supabase, instanceId, "escalated", "Vote of No Confidence exhausted — escalating to human");
  }

  // Either outcome reaches the Polish Gate — a passed draft still requires
  // human sign-off (EAS §7.2); a failed one reaches it via forced escalation.
  await transition(
    supabase,
    instanceId,
    "awaiting_human",
    vetoResult!.pass ? "Draft cleared veto — awaiting Polish Gate" : "Escalated — awaiting Polish Gate",
  );

  return {
    draft: draftResult ? String(draftResult.output) : null,
    vetoResult,
    attempts: attempt,
    confidence,
    agentRunId: draftResult?.agentRunId ?? null,
  };
}

// Human Gate decision — humanGates.js's decide(), re-expressed against the
// real Workflow Instance state machine instead of an in-memory
// proposal.gates object. No API exists for a Workflow Definition or an
// Agent to self-approve a gate (Parliament Core §2.4, EAS §7.2).
//
// gateType matters: this Phase 1 slice wires up two gates (matching
// humanGates.js's GATE_STATUS_FIELD, which differentiates per-gate next
// states, not one generic approve/reject outcome). Approving Go/No-Go
// routes back to 'running' so the governance loop can be dispatched next
// (real MVP: goNoGo -> 'drafting'); approving Polish finishes the instance
// (real MVP: polish -> 'awaiting_submission_gate', 'completed' here since
// this slice doesn't implement the Submission Gate). A prior version of
// this function collapsed both into one generic completed/failed outcome —
// caught and fixed via the staging dry run below, before this was ever
// exercised for real.
export type GateType = "go_no_go" | "polish";

export interface DecideGateParams {
  supabase: SupabaseClient;
  instanceId: string;
  organisationId: string;
  gateType: GateType;
  decision: "approved" | "rejected";
  note?: string;
  actorId?: string;
}

export async function decideGate(params: DecideGateParams) {
  const { supabase, instanceId, organisationId, gateType, decision, note, actorId } = params;

  const { data: instance, error } = await supabase
    .from("workflow_instances")
    .select("state")
    .eq("id", instanceId)
    .single();
  if (error || !instance) throw new Error("workflow instance not found");

  if (instance.state !== "awaiting_human") {
    throw new Error(`gate_precondition_unmet: instance is in state '${instance.state}', not 'awaiting_human'`);
  }

  await writeAuditEvent(supabase, {
    organisationId,
    actorType: "human",
    actorId: actorId ?? null,
    action: "gate_decision",
    targetType: "workflow_instance",
    targetId: instanceId,
    detail: { gateType, decision, note: note ?? null },
  });

  let nextState: WorkflowState;
  if (decision === "rejected") {
    nextState = "failed";
  } else if (gateType === "go_no_go") {
    nextState = "running"; // ready for the Writing ministry / governance loop
  } else {
    nextState = "completed"; // Polish gate cleared
  }

  await transition(
    supabase,
    instanceId,
    nextState,
    `${gateType} gate decision: ${decision}${note ? ` (${note})` : ""}`,
  );

  return { instanceId, gateType, state: nextState };
}
