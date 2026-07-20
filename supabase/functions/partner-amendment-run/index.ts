// POST /partner-amendment-run
// Grant Studio spec §4.2/§4.3: amendment management (role, mandate, or
// budget-share change mid-project), owned by Compliance, jointly
// consulted with Finance & Administration when the change affects budget
// share. Requires a justification — same "never silently suppresses"
// discipline used everywhere else a change to a flagged/consequential
// record is recorded in this codebase.
//
// Body: { projectId, partnerId, changeType: 'role'|'subcontract_value', newValue, justification }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { recordAmendment } from "../_shared/partnerPostAward.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, partnerId, changeType, newValue, justification } = body;
    if (!projectId || !partnerId || !["role", "subcontract_value"].includes(changeType) || newValue === undefined) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "projectId, partnerId, changeType ('role'|'subcontract_value'), newValue are required" } }),
        { status: 400 },
      );
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

    const result = await recordAmendment({
      supabase: admin,
      organisationId: caller.organisationId,
      actorId: caller.userId,
      partnerId,
      changeType,
      newValue,
      justification,
    });

    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : message.startsWith("bad_request") ? 400 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
