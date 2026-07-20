// POST /report-validate-run
// Grant Studio spec §9.1: "GET /reports/{projectId}/validate — Reporting
// Validator, same compliance_findings mechanism as §8." Implemented as
// POST/body-based, matching this repo's convention.
//
// Body: { projectId, reportId }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { validateReport } from "../_shared/reportingStudio.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, reportId } = body;
    if (!projectId || !reportId) {
      return new Response(JSON.stringify({ error: { code: "bad_request", message: "projectId, reportId are required" } }), { status: 400 });
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);

    const { data: report, error: reportErr } = await admin.from("reports").select("id, organisation_id").eq("id", reportId).single();
    if (reportErr || !report) {
      return new Response(JSON.stringify({ error: { code: "not_found", message: "report not found" } }), { status: 404 });
    }
    if (report.organisation_id !== caller.organisationId) {
      return new Response(JSON.stringify({ error: { code: "forbidden", message: "report belongs to a different organisation" } }), { status: 403 });
    }

    const result = await validateReport({ supabase: admin, organisationId: caller.organisationId, reportId });

    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
