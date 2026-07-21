// POST /executive-dashboard-compliance-get
// Executive Dashboard (Frontend spec §5) — compliance posture only.
// Pipeline status, deadlines, and cost are direct Supabase reads from the
// frontend (RLS alone gates them, per Frontend spec §2's rule — no Edge
// Function needed there). Compliance posture is the one section that
// needs real cross-artefact aggregation logic beyond a plain RLS-scoped
// read, matching the same pattern compliance-status-get already uses —
// getOrganisationComplianceOverview (complianceStudio.ts) does the actual
// work, this function is just the auth/organisation-scoping wrapper.
//
// Body: { projectId }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { getOrganisationComplianceOverview } from "../_shared/complianceStudio.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId } = body;
    if (!projectId) {
      return new Response(JSON.stringify({ error: { code: "bad_request", message: "projectId is required" } }), { status: 400 });
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);

    const overview = await getOrganisationComplianceOverview({ supabase: admin, organisationId: caller.organisationId });

    return new Response(JSON.stringify(overview), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
