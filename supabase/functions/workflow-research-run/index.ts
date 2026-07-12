// POST /workflow-research-run
// Runs the Research Ministry's Go/No-Go Risk Matrix (pmAgent.js's
// runResearchPhase, re-platformed) and transitions the Workflow Instance
// to awaiting_human (Human Gate 2, Go/No-Go). Requires the Strategic
// Decision gate to already be approved — enforced by the caller's own
// Workflow Instance state, per Parliament Core §2.4.
//
// Body: { workflowInstanceId, projectId, brief, donorGuidelines?, constraints }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { runResearchPhase } from "../_shared/workflowEngine.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { workflowInstanceId, projectId, brief, donorGuidelines, constraints } = body;
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
      .select("state")
      .eq("id", workflowInstanceId)
      .single();
    if (!instance) {
      return new Response(JSON.stringify({ error: { code: "not_found", message: "workflow instance not found" } }), { status: 404 });
    }
    if (instance.state !== "running" && instance.state !== "pending") {
      return new Response(
        JSON.stringify({
          error: {
            code: "gate_precondition_unmet",
            message: `instance is in state '${instance.state}', expected 'running' or 'pending'`,
          },
        }),
        { status: 409 },
      );
    }

    const result = await runResearchPhase({
      supabase: admin,
      instanceId: workflowInstanceId,
      organisationId: caller.organisationId,
      projectId,
      brief,
      donorGuidelines,
      constraints,
    });

    return new Response(JSON.stringify({ workflowInstanceId, result: result.output, agentRunId: result.agentRunId }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
