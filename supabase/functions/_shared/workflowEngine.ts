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
import { buildPrompt as buildResearchPrompt, mockRun as mockResearchRun, parseResponse as parseResearchResponse, ResearchInput } from "./ministries/research.ts";
import { buildPrompt as buildWritingPrompt, mockDraft, WritingInput } from "./ministries/writing.ts";
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
    buildPrompt: (i) => buildResearchPrompt(i as unknown as ResearchInput),
    mockRun: (i) => mockResearchRun(i as unknown as ResearchInput),
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
      buildPrompt: (i) => buildWritingPrompt(i as unknown as WritingInput),
      mockRun: (i) => mockDraft(i as unknown as WritingInput),
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
// gateType matters: this Phase 1 slice wires up three gates (matching
// humanGates.js's GATE_STATUS_FIELD, which differentiates per-gate next
// states, not one generic approve/reject outcome). Approving Go/No-Go
// routes back to 'running' so the governance loop can be dispatched next
// (real MVP: goNoGo -> 'drafting'); approving Polish now routes back to
// 'awaiting_human' — Submission Gate next, not terminal (real MVP: polish
// -> 'awaiting_submission_gate'); approving Submission is the only path
// that reaches 'completed'. Per EAS §9's Liability NFR: "no fully
// autonomous submission path exists anywhere in the platform... always a
// named, logged, human act" — Submission Gate is deliberately the one gate
// with no automated bypass of any kind. A prior version of this function
// collapsed all outcomes into one generic completed/failed result — caught
// and fixed via the staging dry run before this was ever exercised for
// real.
export type GateType = "go_no_go" | "polish" | "submission";

// Gate-sequencing integrity — necessary once three gates share one generic
// 'awaiting_human' state. Without this, a client could call gateType out
// of order (most dangerously, 'submission' straight after Research),
// bypassing intermediate gates and their override checks entirely — which
// would make the override enforcement below decorative, not real. This
// gap existed even with two gates (nothing stopped calling 'polish' before
// 'go_no_go' was ever approved) but only became security-relevant once
// skipping a gate could also skip a required override justification.
//
// Derived from the most recent relevant audit_events row rather than a new
// column, consistent with the rest of this module's "reuse existing data"
// pattern. Returns null if no relevant history exists yet (defensive
// fallback: decideGate treats null as "can't determine, don't block" —
// this shouldn't occur through the normal API flow, since decideGate's own
// 'awaiting_human' precondition check already gates entry).
async function getExpectedGateType(supabase: SupabaseClient, instanceId: string): Promise<GateType | null> {
  const { data } = await supabase
    .from("audit_events")
    .select("action, detail, created_at")
    .eq("target_id", instanceId)
    .in("action", ["feasibility_assessment", "veto_result", "gate_decision"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  if (data.action === "feasibility_assessment") return "go_no_go";
  if (data.action === "veto_result") return "polish";
  if (data.action === "gate_decision") {
    const detail = data.detail as { gateType?: GateType; decision?: string } | null;
    if (detail?.gateType === "polish" && detail?.decision === "approved") return "submission";
  }
  return null;
}

// Override detection — EAS §3.1's Compliance Override control ("an
// authorised human accepts a flagged risk with a logged justification; it
// never silently suppresses a flag"), extended from Grant Studio §8.1's
// compliance_findings-specific mechanism to this slice's three real
// flagged-risk cases, confirmed via the live-model verification run (see
// supabase/README.md): a Polish Gate approval on a Vote of No Confidence
// escalation, a Go/No-Go approval against a NO-GO recommendation, and now
// a Submission Gate approval where any earlier gate in this instance's
// history was itself an override. That last one is deliberate: an
// override at Polish or Go/No-Go doesn't get "used up" once logged — the
// final, most consequential gate (the one that reaches a donor) requires
// the human to consciously re-confirm it, not silently inherit an earlier
// human's judgment call.
//
// Single-governance-loop-pass assumption: wasEscalated looks for an
// 'escalated' row anywhere in the instance's history. Safe today because
// this Phase 1 slice runs the governance loop at most once per instance
// (no redraft-after-Polish-rejection cycle exists yet). If that's added
// later, this needs scoping to "since the last gate decision," not "ever
// in history," or a re-escalation after a redraft would be missed.
async function wasEscalated(supabase: SupabaseClient, instanceId: string): Promise<boolean> {
  const { data } = await supabase
    .from("workflow_instance_history")
    .select("id")
    .eq("workflow_instance_id", instanceId)
    .eq("state", "escalated")
    .limit(1);
  return !!(data && data.length > 0);
}

// research_ministry's recommendation isn't stored on a dedicated column —
// it lives in the feasibility_assessment audit_events row's detail.output,
// written by runResearchPhase. Reading it back here rather than adding a
// new column keeps this a read of existing data, not new schema.
async function getResearchRecommendation(supabase: SupabaseClient, instanceId: string): Promise<string | null> {
  const { data } = await supabase
    .from("audit_events")
    .select("detail")
    .eq("target_id", instanceId)
    .eq("action", "feasibility_assessment")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const output = (data?.detail as Record<string, unknown> | undefined)?.output as
    | { recommendation?: string }
    | undefined;
  return output?.recommendation ?? null;
}

// Every prior gate_decision for this instance, checked for wasOverride —
// the Submission Gate's trigger. Reuses the same audit_events rows the
// other two triggers read from; no new schema.
async function hasAnyPriorOverride(
  supabase: SupabaseClient,
  instanceId: string,
): Promise<{ has: boolean; reasons: string[] }> {
  const { data } = await supabase
    .from("audit_events")
    .select("detail")
    .eq("target_id", instanceId)
    .eq("action", "gate_decision");
  const overrides = (data ?? [])
    .map((row) => row.detail as { wasOverride?: boolean; overrideReason?: string } | null)
    .filter((d): d is { wasOverride: true; overrideReason?: string } => d?.wasOverride === true);
  return { has: overrides.length > 0, reasons: overrides.map((o) => o.overrideReason ?? "unknown") };
}

export interface DecideGateParams {
  supabase: SupabaseClient;
  instanceId: string;
  organisationId: string;
  gateType: GateType;
  decision: "approved" | "rejected";
  note?: string;
  overrideJustification?: string;
  actorId?: string;
}

export async function decideGate(params: DecideGateParams) {
  const { supabase, instanceId, organisationId, gateType, decision, note, overrideJustification, actorId } = params;

  const { data: instance, error } = await supabase
    .from("workflow_instances")
    .select("state")
    .eq("id", instanceId)
    .single();
  if (error || !instance) throw new Error("workflow instance not found");

  if (instance.state !== "awaiting_human") {
    throw new Error(`gate_precondition_unmet: instance is in state '${instance.state}', not 'awaiting_human'`);
  }

  const expectedGate = await getExpectedGateType(supabase, instanceId);
  if (expectedGate && expectedGate !== gateType) {
    throw new Error(
      `gate_precondition_unmet: instance is awaiting the '${expectedGate}' gate, not '${gateType}' — gates cannot be taken out of order`,
    );
  }

  let wasOverride = false;
  let overrideReason: string | null = null;

  if (decision === "approved") {
    if (gateType === "polish" && (await wasEscalated(supabase, instanceId))) {
      wasOverride = true;
      overrideReason = "vote_of_no_confidence_escalated";
    } else if (gateType === "go_no_go") {
      const recommendation = await getResearchRecommendation(supabase, instanceId);
      if (recommendation === "NO-GO") {
        wasOverride = true;
        overrideReason = "research_recommended_no_go";
      }
    } else if (gateType === "submission") {
      const prior = await hasAnyPriorOverride(supabase, instanceId);
      if (prior.has) {
        wasOverride = true;
        overrideReason = `prior_override_in_workflow:${prior.reasons.join("+")}`;
      }
    }
  }

  if (wasOverride && !overrideJustification?.trim()) {
    throw new Error(
      `override_justification_required: approving this ${gateType} gate overrides a flagged failure (${overrideReason}) — a justification is required, per EAS §3.1's Compliance Override control`,
    );
  }

  await writeAuditEvent(supabase, {
    organisationId,
    actorType: "human",
    actorId: actorId ?? null,
    action: "gate_decision",
    targetType: "workflow_instance",
    targetId: instanceId,
    detail: {
      gateType,
      decision,
      note: note ?? null,
      wasOverride,
      overrideReason,
      overrideJustification: wasOverride ? overrideJustification : null,
    },
  });

  let nextState: WorkflowState;
  if (decision === "rejected") {
    nextState = "failed";
  } else if (gateType === "go_no_go") {
    nextState = "running"; // ready for the Writing ministry / governance loop
  } else if (gateType === "polish") {
    nextState = "awaiting_human"; // Submission Gate next, not terminal
  } else {
    // submission: the only path that ends here — EAS §9's Liability NFR,
    // "no fully autonomous submission path exists anywhere in the platform."
    nextState = "completed";
  }

  const suffix = gateType === "polish" && nextState === "awaiting_human" ? " — awaiting Submission Gate" : "";

  await transition(
    supabase,
    instanceId,
    nextState,
    `${gateType} gate decision: ${decision}${
      wasOverride ? ` (OVERRIDE: ${overrideJustification})` : note ? ` (${note})` : ""
    }${suffix}`,
  );

  return { instanceId, gateType, state: nextState, wasOverride };
}
