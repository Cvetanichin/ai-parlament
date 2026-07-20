// POST /budget-validate-run
// Grant Studio spec §7.1: "GET /budgets/{proposalId}/validate" (implemented
// as POST, matching this repo's body-based convention for every other
// function — no path params anywhere in this codebase). Runs both
// deterministic tiers described in budgetEngine.ts: mathematical
// consistency (this repo's own arithmetic over line_items) and the
// Regulatory Budget API rollup (real compliance_findings, or
// context_dependent when none are ingested yet).
//
// Body: { projectId, budgetId }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { runBudgetValidation } from "../_shared/budgetEngine.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, budgetId } = body;
    if (!projectId || !budgetId) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "projectId, budgetId are required" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);

    const { data: budget, error: budgetErr } = await admin
      .from("budgets")
      .select("id, organisation_id")
      .eq("id", budgetId)
      .single();
    if (budgetErr || !budget) {
      return new Response(JSON.stringify({ error: { code: "not_found", message: "budget not found" } }), { status: 404 });
    }
    if (budget.organisation_id !== caller.organisationId) {
      return new Response(JSON.stringify({ error: { code: "forbidden", message: "budget belongs to a different organisation" } }), { status: 403 });
    }

    const result = await runBudgetValidation({ supabase: admin, organisationId: caller.organisationId, budgetId });

    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
