// POST /workflow-governance-run
// Runs the Governance Core loop: Writing Ministry -> Tripartite Veto Engine
// -> Vote of No Confidence (if needed) -> hand-off to the Polish Gate.
// pmAgent.js's runGovernanceLoop, re-platformed onto the real
// workflow_instances/workflow_instance_history tables. Requires the
// Go/No-Go gate to already be approved (instance state must not be
// awaiting_human at call time — the caller decides that gate first via
// workflow-gate-decide, which sets state back to 'running').
//
// Body: { workflowInstanceId, projectId, brief, constraints, voteOfNoConfidenceThreshold? }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { runGovernanceLoop } from "../_shared/workflowEngine.ts";
import { withCors } from "../_shared/cors.ts";

// ADR-0009 §4 Phase C.2: read at invocation time. Defaults to "shadow" --
// the safe default -- when unset, so no secret has to be configured for
// this phase to be meaningful. "enforced" is defined here but not yet
// activated: nothing in this function's behaviour branches on it until
// Phase C.6 re-platforms the live ministries onto the governance loop.
const GOVERNANCE_MODE = Deno.env.get("GOVERNANCE_MODE") ?? "shadow";

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { workflowInstanceId, projectId, brief, constraints, voteOfNoConfidenceThreshold } = body;
    if (!workflowInstanceId || !projectId || !brief || !constraints) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "workflowInstanceId, projectId, brief, constraints are required" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);

    const { data: instance } = await admin
      .from("workflow_instances")
      .select("state, workflow_definition_id")
      .eq("id", workflowInstanceId)
      .single();
    if (!instance) {
      return new Response(JSON.stringify({ error: { code: "not_found", message: "workflow instance not found" } }), { status: 404 });
    }
    if (instance.state === "awaiting_human" || instance.state === "completed" || instance.state === "failed") {
      return new Response(
        JSON.stringify({
          error: { code: "gate_precondition_unmet", message: `instance is in state '${instance.state}' — Go/No-Go gate must be approved before the Writing Ministry can be activated` },
        }),
        { status: 409 },
      );
    }

    let threshold = voteOfNoConfidenceThreshold;
    if (!threshold) {
      const { data: def } = await admin
        .from("workflow_definitions")
        .select("vote_of_no_confidence_threshold")
        .eq("id", instance.workflow_definition_id)
        .single();
      threshold = def?.vote_of_no_confidence_threshold ?? 2;
    }

    const result = await runGovernanceLoop({
      supabase: admin,
      instanceId: workflowInstanceId,
      organisationId: caller.organisationId,
      projectId,
      brief,
      constraints,
      voteOfNoConfidenceThreshold: threshold,
    });

    return new Response(
      JSON.stringify({
        workflowInstanceId,
        draft: result.draft,
        vetoPassed: result.vetoResult?.pass ?? false,
        vetoChecks: result.vetoResult?.checks ?? null,
        attempts: result.attempts,
        confidence: result.confidence,
        governanceMode: GOVERNANCE_MODE,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
}));
