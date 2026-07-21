// POST /submission-package-submit
// Grant Studio spec §10.1: "POST /submission-packages/{id}/submit — Human
// Gate 4 only — the sole path that sets status = 'submitted',
// submitted_by, submitted_at; no other endpoint or agent can reach this
// state." EAS §9 Liability NFR: always a named, logged, human act — hence
// requireGateRole (owner/admin only, Security spec §2.2), same restriction
// workflow-gate-decide already enforces for the section-level gates.
// submission_packages also revokes UPDATE from authenticated directly
// (migration 08) — this service-role function is the only write path,
// full stop, not just the only *intended* one.
//
// Body: { projectId, submissionPackageId }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller, requireGateRole } from "../_shared/auth.ts";
import { submitPackage } from "../_shared/submissionGateway.ts";
import { publishEvent } from "../_shared/eventBus.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, submissionPackageId } = body;
    if (!projectId || !submissionPackageId) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "projectId, submissionPackageId are required" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);
    requireGateRole(caller);

    const result = await submitPackage({
      supabase: admin,
      organisationId: caller.organisationId,
      actorId: caller.userId,
      submissionPackageId,
    });

    await publishEvent({
      supabase: admin,
      organisationId: caller.organisationId,
      eventType: "submission_submitted",
      sourceService: "submission-package-submit",
      targetType: "submission_package",
      targetId: submissionPackageId,
      payload: result as Record<string, unknown>,
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
