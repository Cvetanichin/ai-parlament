// POST /submission-package-compile
// Grant Studio spec §10.1: "POST /submission-packages/{proposalId}/compile
// — assembles Proposal sections, Logframe, Budget, and mandatory annexes
// into compiled_documents — blocked server-side unless Compliance Studio's
// aggregated status, §8.1, is pass or an explicitly overridden warning."
//
// Body: { projectId, proposalId }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { compileSubmissionPackage } from "../_shared/submissionGateway.ts";

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

    const result = await compileSubmissionPackage({ supabase: admin, organisationId: caller.organisationId, proposalId });

    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized")
      ? 401
      : message.startsWith("forbidden")
        ? 403
        : message.startsWith("not_found")
          ? 404
          : message.startsWith("gate_precondition_unmet")
            ? 409
            : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
