// POST /memory-institutional-write
// House of Parliament spec §3: "POST /memory/institutional (tier fixed to
// institutional, organisation_id fixed to null)."
//
// Body: { content, contentType: 'fact'|'decision'|'preference'|'risk_pattern', justification }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolvePlatformOperator } from "../_shared/auth.ts";
import { writeInstitutionalMemory } from "../_shared/institutionalMemory.ts";

const CONTENT_TYPES = ["fact", "decision", "preference", "risk_pattern"];

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { content, contentType, justification } = body;
    if (!content || !CONTENT_TYPES.includes(contentType) || !justification) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: `content, contentType (${CONTENT_TYPES.join("|")}), justification are required` } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const operator = await resolvePlatformOperator(req, admin);

    const result = await writeInstitutionalMemory({ supabase: admin, actorId: operator.userId, content, contentType, justification });

    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("bad_request") ? 400 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
