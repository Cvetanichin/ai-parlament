// POST /workflow-definition-threshold-update
// House of Parliament spec §5: Vote of No Confidence Threshold Authoring —
// editing workflow_definitions.voteOfNoConfidenceThreshold requires
// is_platform_operator, logged as an Audit Event.
//
// Body: { workflowDefinitionId, newThreshold }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolvePlatformOperator } from "../_shared/auth.ts";
import { updateVoteOfNoConfidenceThreshold } from "../_shared/workflowDefinitionAuthoring.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { workflowDefinitionId, newThreshold } = body;
    if (!workflowDefinitionId || newThreshold === undefined) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "workflowDefinitionId, newThreshold are required" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const operator = await resolvePlatformOperator(req, admin);

    const result = await updateVoteOfNoConfidenceThreshold({ supabase: admin, actorId: operator.userId, workflowDefinitionId, newThreshold });

    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized")
      ? 401
      : message.startsWith("forbidden")
        ? 403
        : message.startsWith("not_found")
          ? 404
          : message.startsWith("bad_request")
            ? 400
            : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
