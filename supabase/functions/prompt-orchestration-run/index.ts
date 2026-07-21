// POST /prompt-orchestration-run
// Entry point for Prompt Orchestration Platform, absorbed into Parliament
// Core per ADR-0011/0012 (docs/21-ADRs, repo root) and
// apps/prompt-orchestration-platform/docs/PHASE1_RESCOPING.md. Shared by
// all seven agents registered in migration 18_prompt_orchestration_seed.sql
// (intake_normalizer, intent_classifier, the three v1 specialists,
// validator_indicators, formatter_table_first) — one function, many
// registered agents, following the live precedent that writing_ministry
// and compliance_judge already both point at workflow-governance-run.
//
// Sequence: intake_normalizer -> intent_classifier -> deterministic
// routing (routing_rules) -> workflow_instances created -> specialist ->
// (validator, Vote of No Confidence loop) -> formatter -> completed.
// intake_normalizer/intent_classifier run BEFORE a workflow_instance
// exists, since their output determines which Workflow Definition to
// instantiate in the first place (PHASE1_RESCOPING.md §5.2) — they are not
// steps inside any workflow_definitions.transitions.
//
// Body: { projectId, userInput }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { invokeAgent } from "../_shared/agentRuntime.ts";
import { startInstance, runPromptOrchestrationTask } from "../_shared/workflowEngine.ts";
import { resolveWorkflowForRequest } from "../_shared/promptOrchestrationRouting.ts";

import * as intakeNormalizer from "../_shared/ministries/promptOrchestration/intakeNormalizer.ts";
import * as intentClassifier from "../_shared/ministries/promptOrchestration/intentClassifier.ts";
import * as specialistMeFramework from "../_shared/ministries/promptOrchestration/specialistMeFramework.ts";
import * as specialistProductMvp from "../_shared/ministries/promptOrchestration/specialistProductMvp.ts";
import * as specialistPromptEngineering from "../_shared/ministries/promptOrchestration/specialistPromptEngineering.ts";
import * as validatorIndicators from "../_shared/ministries/promptOrchestration/validatorIndicators.ts";
import * as formatterTableFirst from "../_shared/ministries/promptOrchestration/formatterTableFirst.ts";

// Per-domain wiring — which specialist/validator this request's classified
// domain routes to. This is wiring (which code module handles which
// already-classified domain), not a business decision an LLM should make;
// the business decision (which domain the request IS) already happened in
// intent_classifier. Only the three v1 domains are wired — PHASE1_RESCOPING.md
// §7/§8 scopes v1 to exactly these three; an unmatched domain returns 422,
// it does not silently fall through to a default.
interface DomainWorkflow {
  specialistAgentSlug: string;
  buildSpecialistPrompt: (input: Record<string, unknown>) => string;
  mockSpecialistRun: (input: Record<string, unknown>) => string;
  validator?: {
    agentSlug: string;
    constraints: validatorIndicators.IndicatorValidationConstraints;
    deterministicCheck: (draft: string, constraints: validatorIndicators.IndicatorValidationConstraints) => ReturnType<typeof validatorIndicators.deterministicCheck>;
    lexicalCheck: (draft: string, constraints: validatorIndicators.IndicatorValidationConstraints) => ReturnType<typeof validatorIndicators.lexicalCheck>;
    buildSemanticPrompt: (input: Record<string, unknown>) => string;
    mockSemanticRun: (input: Record<string, unknown>) => string;
    parseSemanticVerdict: typeof validatorIndicators.parseSemanticVerdict;
  };
}

const DOMAIN_WORKFLOWS: Record<string, DomainWorkflow> = {
  monitoring_and_evaluation: {
    specialistAgentSlug: "specialist_me_framework",
    buildSpecialistPrompt: (input) => specialistMeFramework.buildPrompt(input as specialistMeFramework.SpecialistMeFrameworkInput),
    mockSpecialistRun: (input) => specialistMeFramework.mockRun(input as specialistMeFramework.SpecialistMeFrameworkInput),
    validator: {
      agentSlug: "validator_indicators",
      constraints: { minLength: 40 },
      deterministicCheck: validatorIndicators.deterministicCheck,
      lexicalCheck: validatorIndicators.lexicalCheck,
      buildSemanticPrompt: (input) => validatorIndicators.buildSemanticPrompt(input as validatorIndicators.ValidatorIndicatorsSemanticInput),
      mockSemanticRun: (input) => validatorIndicators.mockSemanticRun(input as validatorIndicators.ValidatorIndicatorsSemanticInput),
      parseSemanticVerdict: validatorIndicators.parseSemanticVerdict,
    },
  },
  product_and_mvp: {
    specialistAgentSlug: "specialist_product_mvp",
    buildSpecialistPrompt: (input) => specialistProductMvp.buildPrompt(input as specialistProductMvp.SpecialistProductMvpInput),
    mockSpecialistRun: (input) => specialistProductMvp.mockRun(input as specialistProductMvp.SpecialistProductMvpInput),
    // No validator seeded yet for this workflow — migration 18's note.
  },
  prompt_engineering: {
    specialistAgentSlug: "specialist_prompt_engineering",
    buildSpecialistPrompt: (input) => specialistPromptEngineering.buildPrompt(input as specialistPromptEngineering.SpecialistPromptEngineeringInput),
    mockSpecialistRun: (input) => specialistPromptEngineering.mockRun(input as specialistPromptEngineering.SpecialistPromptEngineeringInput),
    // No validator seeded yet for this workflow — migration 18's note.
  },
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, userInput } = body;
    if (!projectId || !userInput) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "projectId and userInput are required" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);

    // GLOBAL_CONTROL — fetched once per run, prepended to every downstream
    // prompt this function builds (PHASE1_RESCOPING.md §5.1), not once per
    // agent call.
    const { data: globalControlRow, error: globalControlErr } = await admin
      .from("context_assets")
      .select("content")
      .eq("name", "Global Control")
      .eq("active", true)
      .maybeSingle();
    if (globalControlErr) throw globalControlErr;
    const globalControl = globalControlRow?.content ?? "";

    // 1. intake_normalizer — strict Structured Output (ADR-0012).
    const intakeResult = await invokeAgent({
      supabase: admin,
      agentSlug: "intake_normalizer",
      projectId,
      organisationId: caller.organisationId,
      input: { globalControl, userInput },
      buildPrompt: (input) => intakeNormalizer.buildPrompt(input as intakeNormalizer.IntakeNormalizerInput),
      mockStructured: (input) => intakeNormalizer.mockStructured(input as intakeNormalizer.IntakeNormalizerInput),
    });
    const normalizedInput = intakeResult.output as Record<string, unknown>;

    // 2. intent_classifier — strict Structured Output (ADR-0012).
    const classifierResult = await invokeAgent({
      supabase: admin,
      agentSlug: "intent_classifier",
      projectId,
      organisationId: caller.organisationId,
      input: { globalControl, normalizedInput },
      buildPrompt: (input) => intentClassifier.buildPrompt(input as intentClassifier.IntentClassifierInput),
      mockStructured: (input) => intentClassifier.mockStructured(input as intentClassifier.IntentClassifierInput),
    });
    const classification = classifierResult.output as Record<string, unknown>;
    const domain = String(classification.domain ?? "");

    // 3. Deterministic routing — routing_rules, not a second LLM call
    // (PHASE1_RESCOPING.md §5.2).
    const resolved = await resolveWorkflowForRequest(admin, classification);
    const workflow = DOMAIN_WORKFLOWS[domain];
    if (!resolved || !workflow) {
      return new Response(
        JSON.stringify({
          error: {
            code: "no_matching_workflow",
            message: `No v1 Prompt Orchestration workflow is wired for domain '${domain}'. Currently supported: ${Object.keys(DOMAIN_WORKFLOWS).join(", ")}.`,
          },
          classification,
        }),
        { status: 422 },
      );
    }

    const { data: workflowDef, error: workflowDefErr } = await admin
      .from("workflow_definitions")
      .select("vote_of_no_confidence_threshold")
      .eq("id", resolved.workflowDefinitionId)
      .single();
    if (workflowDefErr) throw workflowDefErr;

    // No pre-existing target entity for a Prompt Orchestration run (unlike
    // Grant Studio's Proposal/Report) — target_id has no foreign key
    // constraint (workflow_instances DDL), so a fresh UUID is minted purely
    // as this instance's own correlation identifier.
    const instanceId = await startInstance({
      supabase: admin,
      organisationId: caller.organisationId,
      workflowDefinitionId: resolved.workflowDefinitionId,
      targetType: "prompt_orchestration_run",
      targetId: crypto.randomUUID(),
    });

    // 4. Specialist -> (validator, Vote of No Confidence loop) -> formatter.
    // Context selection (CONTEXT_FILTER) is deferred to Phase 3 per
    // BUILD_SPEC.md's own rollout order — no context_assets lookup happens
    // here yet; selectedContext is intentionally omitted, not silently
    // faked.
    const taskResult = await runPromptOrchestrationTask({
      supabase: admin,
      instanceId,
      organisationId: caller.organisationId,
      projectId,
      globalControl,
      normalizedInput,
      specialistAgentSlug: workflow.specialistAgentSlug,
      buildSpecialistPrompt: workflow.buildSpecialistPrompt,
      mockSpecialistRun: workflow.mockSpecialistRun,
      validator: workflow.validator,
      formatterAgentSlug: "formatter_table_first",
      buildFormatterPrompt: (input) => formatterTableFirst.buildPrompt(input as formatterTableFirst.FormatterTableFirstInput),
      mockFormatterRun: (input) => formatterTableFirst.mockRun(input as formatterTableFirst.FormatterTableFirstInput),
      voteOfNoConfidenceThreshold: workflowDef.vote_of_no_confidence_threshold,
    });

    const { data: runRow, error: runRowErr } = await admin
      .from("prompt_orchestration_runs")
      .insert({
        workflow_instance_id: instanceId,
        organisation_id: caller.organisationId,
        user_input: userInput,
        normalized_input_json: normalizedInput,
        classification_json: classification,
        final_output: taskResult.finalOutput,
        quality_assessment: taskResult.qualityAssessment,
      })
      .select("id")
      .single();
    if (runRowErr) throw runRowErr;

    return new Response(
      JSON.stringify({
        runId: runRow.id,
        workflowInstanceId: instanceId,
        status: taskResult.escalated ? "needs_review" : "completed",
        finalOutput: taskResult.finalOutput,
        qualityAssessment: taskResult.qualityAssessment,
        classification,
        routedTo: resolved.ruleName,
        attempts: taskResult.attempts,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized")
      ? 401
      : message.startsWith("forbidden")
        ? 403
        : message.startsWith("not_found")
          ? 404
          : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
