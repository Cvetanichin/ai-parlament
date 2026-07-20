// POST /partner-performance-rate
// Grant Studio spec §4.2/§4.3: structured partner performance feedback,
// owned by M&E, written back to institutional memory (Knowledge Platform,
// EAS §3.3) so future Consortium Builder capacity scoring (§4.1,
// scorePartnerCapacity's past_cooperation_notes signal) reflects real
// cooperation history, not just self-reported claims.
//
// Body: { projectId, partnerId, rating (0-5), notes }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { ratePerformance } from "../_shared/partnerPostAward.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, partnerId, rating, notes } = body;
    if (!projectId || !partnerId || rating === undefined || !notes) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "projectId, partnerId, rating, notes are required" } }),
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

    const result = await ratePerformance({
      supabase: admin,
      organisationId: caller.organisationId,
      actorId: caller.userId,
      partnerId,
      rating,
      notes,
    });

    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : message.startsWith("bad_request") ? 400 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
