// GET /eligibility-report-get?projectId=&opportunityId=
// Grant Studio spec §3.1: "GET /eligibility-reports?opportunityId= — what
// Human Gate 2's UI reads to render the report and block/allow approval."
// Named eligibility-report-get (Edge Functions route by function name, not
// arbitrary REST paths) rather than eligibility-reports to keep this
// slice's one-function-per-verb convention (research-run, governance-run,
// gate-decide) rather than mixing verb-in-path and REST-resource styles.
// projectId is required in addition to opportunityId because every
// function in this slice resolves the caller's organisation via a project
// (auth.ts's resolveCaller), not via the Opportunity directly.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { withCors } from "../_shared/cors.ts";

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "GET only" } }), { status: 405 });
  }

  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const opportunityId = url.searchParams.get("opportunityId");
    if (!projectId || !opportunityId) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "projectId, opportunityId query params are required" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);

    const { data: report, error } = await admin
      .from("eligibility_reports")
      .select("*")
      .eq("organisation_id", caller.organisationId)
      .eq("opportunity_id", opportunityId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!report) {
      return new Response(JSON.stringify({ error: { code: "not_found", message: "no eligibility report for this opportunity" } }), { status: 404 });
    }

    return new Response(JSON.stringify(report), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
}));
