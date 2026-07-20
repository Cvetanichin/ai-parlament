// POST /compliance-override
// Grant Studio spec §8.1: "POST /compliance/override — Compliance Override
// control, requires owner/admin role per docs/16-Security/ §2.2, writes a
// compliance_findings-linked justification record." This is the original
// compliance_findings-specific override mechanism workflowEngine.ts's
// decideGate later generalised to gate-level overrides (Go/No-Go, Polish,
// Submission) — see decideGate's own comment in workflowEngine.ts.
//
// Body: { projectId, findingId, justification }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller, requireGateRole } from "../_shared/auth.ts";
import { overrideFinding } from "../_shared/complianceStudio.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, findingId, justification } = body;
    if (!projectId || !findingId || !justification) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "projectId, findingId, justification are required" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);
    requireGateRole(caller);

    const result = await overrideFinding({
      supabase: admin,
      organisationId: caller.organisationId,
      actorId: caller.userId,
      findingId,
      justification,
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
          : message.startsWith("override_justification_required")
            ? 400
            : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
