// POST /logframe-get
// Assembled Logframe view (Grant Studio spec §6.1: "GET /logframes/{proposalId}
// -- assembled view: narrative + indicators + activities, what Budget
// Studio and Proposal Builder's Context Engine calls both read"). The only
// piece of Logframe Studio that needs an Edge Function at all — per
// Frontend spec §2's direct-call rule, a single-table RLS-scoped write
// (narrative upsert, indicator insert) goes straight through the Supabase
// client; only this cross-table assembly goes through a function.
//
// "...+ activities" in the spec text means the intervention_logic
// objectives->results->activities tree stored in logframe_narratives
// (§6.1: "intervention_logic... kept JSONB since it is a tree"), not the
// real post-award `activities` table -- that table is project_id-scoped
// execution data with no proposal_id column and no rows yet pre-award
// (Consortium Builder's ADR-0001 "graduates into a real row" pattern:
// pre-award artefacts don't duplicate into post-award tables until award).
//
// Body: { projectId, proposalId }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, proposalId } = body;
    if (!projectId || !proposalId) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "projectId, proposalId are required" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);

    const { data: proposal, error: propErr } = await admin
      .from("proposals")
      .select("id, organisation_id")
      .eq("id", proposalId)
      .single();
    if (propErr || !proposal) {
      return new Response(JSON.stringify({ error: { code: "not_found", message: "proposal not found" } }), { status: 404 });
    }
    if (proposal.organisation_id !== caller.organisationId) {
      return new Response(JSON.stringify({ error: { code: "forbidden", message: "proposal belongs to a different organisation" } }), { status: 403 });
    }

    const { data: narrative, error: narrativeErr } = await admin
      .from("logframe_narratives")
      .select("id, theory_of_change, assumptions, intervention_logic")
      .eq("proposal_id", proposalId)
      .maybeSingle();
    if (narrativeErr) throw narrativeErr;

    const { data: indicators, error: indicatorsErr } = await admin
      .from("indicators")
      .select("id, level, unit, baseline, target, actual, data_source, collection_method, frequency, status")
      .eq("proposal_id", proposalId);
    if (indicatorsErr) throw indicatorsErr;

    return new Response(
      JSON.stringify({
        proposalId,
        narrative: narrative ?? null,
        interventionLogic: narrative?.intervention_logic ?? null,
        indicators: indicators ?? [],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
