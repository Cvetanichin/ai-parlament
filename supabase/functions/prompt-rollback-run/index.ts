// POST /prompt-rollback-run
// Platform Services spec §2.3: "POST /prompts/{id}/rollback." House of
// Parliament spec §4: same is_platform_operator gate as approval.
//
// Body: { promptModuleId } — the deprecated version being reactivated
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolvePlatformOperator } from "../_shared/auth.ts";
import { rollbackPrompt } from "../_shared/promptRegistry.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { promptModuleId } = body;
    if (!promptModuleId) {
      return new Response(JSON.stringify({ error: { code: "bad_request", message: "promptModuleId is required" } }), { status: 400 });
    }

    const admin = supabaseAdmin();
    const operator = await resolvePlatformOperator(req, admin);

    const result = await rollbackPrompt({ supabase: admin, actorId: operator.userId, promptModuleId });

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
