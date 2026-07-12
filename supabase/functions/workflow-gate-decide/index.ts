// POST /workflow-gate-decide
// Human Gate decision (Strategic, Go/No-Go, Polish, Submission — EAS §3.1).
// humanGates.js's decide(), re-platformed onto the real workflow_instances
// state machine. No API exists for a Workflow Definition or an Agent to
// self-approve a gate (Parliament Core §2.4) — this endpoint is the only
// path, and it is restricted to owner/admin (Security spec §2.2).
//
// Body: { workflowInstanceId, projectId, decision: "approved"|"rejected", note? }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller, requireGateRole } from "../_shared/auth.ts";
import { decideGate } from "../_shared/workflowEngine.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { workflowInstanceId, projectId, decision, note } = body;
    if (!workflowInstanceId || !projectId || !["approved", "rejected"].includes(decision)) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "workflowInstanceId, projectId, decision ('approved'|'rejected') are required" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);
    requireGateRole(caller);

    const result = await decideGate({
      supabase: admin,
      instanceId: workflowInstanceId,
      organisationId: caller.organisationId,
      decision,
      note,
      actorId: caller.userId,
    });

    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized")
      ? 401
      : message.startsWith("forbidden")
        ? 403
        : message.startsWith("not_found")
          ? 404
          : message.startsWith("gate_precondition_unmet")
            ? 409
            : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
