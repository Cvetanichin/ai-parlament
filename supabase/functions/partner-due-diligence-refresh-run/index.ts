// POST /partner-due-diligence-refresh-run
// Grant Studio spec §4.2/§4.3: periodic post-award due-diligence refresh,
// owned by Compliance, reusing the same exclusion-criteria machinery as
// pre-award due diligence (§4.1).
//
// Body: { projectId, partnerId }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { refreshDueDiligence } from "../_shared/partnerPostAward.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, partnerId } = body;
    if (!projectId || !partnerId) {
      return new Response(JSON.stringify({ error: { code: "bad_request", message: "projectId, partnerId are required" } }), { status: 400 });
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);

    const { data: partner, error: partnerErr } = await admin.from("partners").select("id, organisation_id").eq("id", partnerId).single();
    if (partnerErr || !partner) {
      return new Response(JSON.stringify({ error: { code: "not_found", message: "partner not found" } }), { status: 404 });
    }
    if (partner.organisation_id !== caller.organisationId) {
      return new Response(JSON.stringify({ error: { code: "forbidden", message: "partner belongs to a different organisation" } }), { status: 403 });
    }

    const result = await refreshDueDiligence({ supabase: admin, organisationId: caller.organisationId, partnerId });

    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
