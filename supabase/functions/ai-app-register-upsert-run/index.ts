// POST /ai-app-register-upsert-run
// AI App Register management (AI Governance spec §2, §8/§9). §8's NFR
// ("Register completeness precedes new AI-assisted functions shipping")
// and §9's open item (review_cadence is "a governance-process decision")
// both point the same way: this is a deliberate, reviewed CRUD action, not
// a trigger auto-populated off `ai_agents` inserts — a new ministry/module
// needs a human to actually pick a real risk_tier and cite a real
// oversight_matrix_ref, which is exactly the kind of judgment call a
// trigger can't make correctly (migration 20's seed comment: "not
// fabricated... detail not yet decided" — the same principle applies to
// any *new* entry created here).
//
// owner/admin only, organisation-scoped (Security spec §2's RBAC model).
// This does NOT manage the 5 platform-wide template entries seeded in
// migration 20 (organisation_id IS NULL) — those are platform-template
// rows, editing them would be a platform-operator action this endpoint
// deliberately doesn't take on; an organisation registers its OWN
// AI-assisted functions here (e.g. a custom integration it built), not
// the shared template list.
//
// Body: { projectId, registerId?, applicationOrMinistry?, purpose?,
//   vendorModel?, dataSources?, riskTier?, oversightMatrixRef?,
//   monitoringKpis?, reviewCadence?, lastReviewedAt? }
// registerId omitted = create (applicationOrMinistry, purpose, vendorModel,
// riskTier required); provided = update (only supplied fields change).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";

const RISK_TIERS = ["minimal", "limited", "high_risk_equivalent"];

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, registerId, applicationOrMinistry, purpose, vendorModel, dataSources, riskTier, oversightMatrixRef, monitoringKpis, reviewCadence, lastReviewedAt } = body;
    if (!projectId) {
      return new Response(JSON.stringify({ error: { code: "bad_request", message: "projectId is required" } }), { status: 400 });
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);
    if (!["owner", "admin"].includes(caller.role)) {
      return new Response(
        JSON.stringify({ error: { code: "forbidden", message: "AI App Register entries require 'owner' or 'admin' role" } }),
        { status: 403 },
      );
    }

    if (riskTier !== undefined && !RISK_TIERS.includes(riskTier)) {
      return new Response(JSON.stringify({ error: { code: "bad_request", message: `riskTier must be one of: ${RISK_TIERS.join(", ")}` } }), { status: 400 });
    }

    let resolvedId: string;

    if (registerId) {
      const { data: existing, error: existingErr } = await admin
        .from("ai_app_register")
        .select("id, organisation_id")
        .eq("id", registerId)
        .single();
      if (existingErr || !existing) {
        return new Response(JSON.stringify({ error: { code: "not_found", message: "AI App Register entry not found" } }), { status: 404 });
      }
      if (existing.organisation_id === null) {
        return new Response(
          JSON.stringify({ error: { code: "forbidden", message: "platform-wide template entries (organisation_id IS NULL) are not editable via this endpoint" } }),
          { status: 403 },
        );
      }
      if (existing.organisation_id !== caller.organisationId) {
        return new Response(JSON.stringify({ error: { code: "forbidden", message: "entry belongs to a different organisation" } }), { status: 403 });
      }

      const updates: Record<string, unknown> = {};
      if (applicationOrMinistry !== undefined) updates.application_or_ministry = applicationOrMinistry;
      if (purpose !== undefined) updates.purpose = purpose;
      if (vendorModel !== undefined) updates.vendor_model = vendorModel;
      if (dataSources !== undefined) updates.data_sources = dataSources;
      if (riskTier !== undefined) updates.risk_tier = riskTier;
      if (oversightMatrixRef !== undefined) updates.oversight_matrix_ref = oversightMatrixRef;
      if (monitoringKpis !== undefined) updates.monitoring_kpis = monitoringKpis;
      if (reviewCadence !== undefined) updates.review_cadence = reviewCadence;
      if (lastReviewedAt !== undefined) updates.last_reviewed_at = lastReviewedAt;
      updates.owner = caller.userId;

      if (Object.keys(updates).length > 0) {
        const { error: updateErr } = await admin.from("ai_app_register").update(updates).eq("id", registerId);
        if (updateErr) throw updateErr;
      }
      resolvedId = registerId;
    } else {
      if (!applicationOrMinistry || !purpose || !vendorModel || !riskTier) {
        return new Response(
          JSON.stringify({ error: { code: "bad_request", message: "applicationOrMinistry, purpose, vendorModel, riskTier are required to create an entry" } }),
          { status: 400 },
        );
      }
      const { data: created, error: createErr } = await admin
        .from("ai_app_register")
        .insert({
          organisation_id: caller.organisationId,
          application_or_ministry: applicationOrMinistry,
          owner: caller.userId,
          purpose,
          vendor_model: vendorModel,
          data_sources: dataSources ?? [],
          risk_tier: riskTier,
          oversight_matrix_ref: oversightMatrixRef ?? null,
          monitoring_kpis: monitoringKpis ?? [],
          review_cadence: reviewCadence ?? "quarterly",
          last_reviewed_at: lastReviewedAt ?? null,
        })
        .select("id")
        .single();
      if (createErr) throw createErr;
      resolvedId = created.id;
    }

    await admin.from("audit_events").insert({
      organisation_id: caller.organisationId,
      actor_type: "human",
      actor_id: caller.userId,
      action: "ai_app_register_upserted",
      target_type: "ai_app_register",
      target_id: resolvedId,
      detail: { wasCreate: !registerId, riskTier: riskTier ?? null },
    });

    return new Response(JSON.stringify({ registerId: resolvedId }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
