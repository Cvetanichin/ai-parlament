// POST /cost-rollup-recompute-run
// AI Governance spec §1.2/§1.3: "cost_rollups is recomputed on a schedule
// (via pg_cron)... never real-time-authoritative." pg_cron scheduling
// itself is docs/15-Infrastructure/'s concern (calling this via pg_net on
// a timer, same mechanism ADR-0009's shadow-invocation trigger already
// uses) — this function is the callable unit that scheduling would invoke,
// and can also be called manually by a platform operator (House of
// Parliament's Token Usage / Cost module, docs/10- §1.10, rehearsing the
// same recompute path a cron tick would use — same principle as Playground
// rehearsing production invocation).
//
// Body: { organisationId, scopeType, scopeId, periodStart, periodEnd }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolvePlatformOperator } from "../_shared/auth.ts";

const SCOPE_TYPES = ["ministry", "proposal", "project", "user"];

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { organisationId, scopeType, scopeId, periodStart, periodEnd } = body;
    if (!organisationId || !SCOPE_TYPES.includes(scopeType) || !scopeId || !periodStart || !periodEnd) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: `organisationId, scopeType (${SCOPE_TYPES.join("|")}), scopeId, periodStart, periodEnd are required` } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    await resolvePlatformOperator(req, admin);

    const { data: rollupId, error } = await admin.rpc("recompute_cost_rollup", {
      p_organisation_id: organisationId,
      p_scope_type: scopeType,
      p_scope_id: scopeId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
    });
    if (error) throw error;

    return new Response(JSON.stringify({ costRollupId: rollupId }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("bad_request") ? 400 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
