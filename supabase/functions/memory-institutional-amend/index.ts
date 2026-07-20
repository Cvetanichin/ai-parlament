// POST /memory-institutional-amend
// House of Parliament spec §3: "PATCH /memory/institutional/{id}" —
// implemented as POST/body-based, matching this repo's convention.
//
// Body: { memoryEntryId, content, justification }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolvePlatformOperator } from "../_shared/auth.ts";
import { amendInstitutionalMemory } from "../_shared/institutionalMemory.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { memoryEntryId, content, justification } = body;
    if (!memoryEntryId || !content || !justification) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "memoryEntryId, content, justification are required" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const operator = await resolvePlatformOperator(req, admin);

    const result = await amendInstitutionalMemory({ supabase: admin, actorId: operator.userId, memoryEntryId, content, justification });

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
