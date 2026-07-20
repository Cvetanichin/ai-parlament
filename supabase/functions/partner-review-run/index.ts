// POST /partner-review-run
// Runs Consortium Builder's pre-award partner review (Grant Studio spec
// §4.1, Module 3): due-diligence screening (exclusion/selection criteria)
// plus capacity scoring against the opportunity's Eligibility Report.
// No Workflow Instance involved — same as eligibility-report-run, this is
// deterministic checklist/rule evaluation, not LLM drafting + veto, so it
// doesn't enter the Workflow Engine's state machine.
//
// Body: { projectId, partnerId, opportunityId }
//
// projectId is required solely because resolveCaller() hard-requires a
// real `projects` row to resolve organisationId — a known limitation
// already carried by eligibility-report-run (see its own header comment)
// for the same pre-award reason: a Partner may not have a Project yet.
// Not a new gap introduced here, just the existing one propagating to a
// second pre-award function.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { runPartnerDueDiligence, scorePartnerCapacity } from "../_shared/consortiumBuilderEngine.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, partnerId, opportunityId } = body;
    if (!projectId || !partnerId || !opportunityId) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "projectId, partnerId, opportunityId are required" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);

    const { data: partner, error: partnerErr } = await admin
      .from("partners")
      .select("id, organisation_id")
      .eq("id", partnerId)
      .single();
    if (partnerErr || !partner) {
      return new Response(JSON.stringify({ error: { code: "not_found", message: "partner not found" } }), { status: 404 });
    }
    if (partner.organisation_id !== caller.organisationId) {
      return new Response(JSON.stringify({ error: { code: "forbidden", message: "partner belongs to a different organisation" } }), { status: 403 });
    }

    const dueDiligence = await runPartnerDueDiligence({ supabase: admin, organisationId: caller.organisationId, partnerId });
    const capacity = await scorePartnerCapacity({ supabase: admin, organisationId: caller.organisationId, partnerId, opportunityId });

    return new Response(JSON.stringify({ partnerId, dueDiligence, capacity }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
