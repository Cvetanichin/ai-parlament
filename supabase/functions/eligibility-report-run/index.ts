// POST /eligibility-report-run
// Runs the Eligibility Engine (Grant Studio spec §3, Module 2) against a
// real Opportunity and writes an eligibility_reports row. Human Gate 2
// (Go/No-Go) requires this report per that spec — "the platform blocks the
// gate server-side if Research has not run" — though wiring that
// precondition into decideGate is deliberately deferred: workflow_instances
// in this Phase 1+ slice target a project directly (brief supplied inline),
// not yet a first-class Opportunity per Grant Studio Module 1 (Opportunity
// Intelligence, unbuilt). Enforcing the precondition now would either
// silently no-op for every existing instance or require guessing an
// Opportunity/instance linkage this spec doesn't define — flagged in
// supabase/README.md rather than guessed at here.
//
// Body: { projectId, opportunityId }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { runEligibilityCheck } from "../_shared/eligibilityEngine.ts";
import { withCors } from "../_shared/cors.ts";

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, opportunityId } = body;
    if (!projectId || !opportunityId) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "projectId, opportunityId are required" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);

    const { data: opportunity, error: oppErr } = await admin
      .from("opportunities")
      .select("id, organisation_id")
      .eq("id", opportunityId)
      .single();
    if (oppErr || !opportunity) {
      return new Response(JSON.stringify({ error: { code: "not_found", message: "opportunity not found" } }), { status: 404 });
    }
    if (opportunity.organisation_id !== caller.organisationId) {
      return new Response(JSON.stringify({ error: { code: "forbidden", message: "opportunity belongs to a different organisation" } }), { status: 403 });
    }

    const report = await runEligibilityCheck({ supabase: admin, organisationId: caller.organisationId, opportunityId });

    return new Response(JSON.stringify(report), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
}));
