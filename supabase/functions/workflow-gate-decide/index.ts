// POST /workflow-gate-decide
// Human Gate decision (Strategic, Go/No-Go, Polish, Submission — EAS §3.1).
// humanGates.js's decide(), re-platformed onto the real workflow_instances
// state machine. No API exists for a Workflow Definition or an Agent to
// self-approve a gate (Parliament Core §2.4) — this endpoint is the only
// path, and it is restricted to owner/admin (Security spec §2.2).
//
// Body: { workflowInstanceId, projectId, gateType: "go_no_go"|"polish"|"submission", decision: "approved"|"rejected", note?, overrideJustification? }
//
// overrideJustification is required (400 if missing) whenever the approval
// overrides a flagged failure — Polish Gate after a Vote of No Confidence
// escalation, Go/No-Go against a NO-GO research recommendation, or
// Submission Gate approval when any earlier gate in this instance's
// history was itself an override. Gates must also be taken in order
// (go_no_go -> polish -> submission); calling one out of sequence now
// returns gate_precondition_unmet (409). See decideGate in
// workflowEngine.ts for the trigger logic and EAS §3.1's Compliance
// Override control this implements.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller, requireGateRole } from "../_shared/auth.ts";
import { decideGate, GateType } from "../_shared/workflowEngine.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { workflowInstanceId, projectId, gateType, decision, note, overrideJustification } = body;
    if (!workflowInstanceId || !projectId || !["go_no_go", "polish", "submission"].includes(gateType) || !["approved", "rejected"].includes(decision)) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "workflowInstanceId, projectId, gateType ('go_no_go'|'polish'|'submission'), decision ('approved'|'rejected') are required" } }),
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
      gateType: gateType as GateType,
      decision,
      note,
      overrideJustification,
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
            : message.startsWith("override_justification_required")
              ? 400
              : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
