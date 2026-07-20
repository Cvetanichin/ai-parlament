// POST /knowledge-search-run
// Knowledge Hub spec §1.1 (Document Browser): semantic search over
// knowledge_documents, filtered by document_type/tags. Embeds the query
// text via the shared embedding client (embedBatch/toPgVectorLiteral,
// same functions embedding-pipeline-run uses, imported normally here
// rather than inlined — that file's inlining was a specific bundling
// workaround for its own import graph, not a rule every function follows)
// and calls the match_knowledge_documents RPC (migration 19), which
// enforces organisation scoping server-side regardless of caller.
//
// Body: { projectId, query, documentType?, tags?, limit? }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { embedBatch, toPgVectorLiteral } from "../_shared/embeddingClient.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, query, documentType, tags, limit } = body;
    if (!projectId || !query) {
      return new Response(JSON.stringify({ error: { code: "bad_request", message: "projectId, query are required" } }), { status: 400 });
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);

    const { vectors } = await embedBatch([query]);

    const { data: matches, error: rpcErr } = await admin.rpc("match_knowledge_documents", {
      p_query_embedding: toPgVectorLiteral(vectors[0]),
      p_organisation_id: caller.organisationId,
      p_document_type: documentType ?? null,
      p_match_count: limit ?? 10,
    });
    if (rpcErr) throw rpcErr;

    // tags filtering happens post-query, not in the RPC — knowledge_
    // documents.tags is a free-form text[] the caller can combine
    // arbitrarily; folding it into the SQL function would mean guessing
    // an AND/OR semantics the spec doesn't state.
    const filtered = Array.isArray(tags) && tags.length > 0
      ? (matches ?? []).filter((m: { tags: string[] }) => tags.some((t: string) => m.tags?.includes(t)))
      : matches ?? [];

    return new Response(JSON.stringify({ results: filtered }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
