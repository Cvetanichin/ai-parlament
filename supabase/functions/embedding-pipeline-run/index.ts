// POST /embedding-pipeline-run
//
// Shared embedding pipeline per ADR-0010. Embeds text from any of the
// five embedding-bearing tables and writes the resulting vector back to
// the source row. Callable in three modes: single-row (event-driven),
// batch backfill, and manual (House of Parliament testing).
//
// Non-negotiable constraints (ADR-0010 §6):
// - Never publicly callable. verify_jwt: true at the platform edge, and
//   this handler additionally requires the caller to be either the
//   service role or a profile with is_platform_operator = true.
// - The provider API key lives in Supabase Vault (OPENAI_API_KEY). It is
//   never passed as a parameter, logged, or returned.
// - Every invocation writes one audit_events row (batch-level, not per
//   row). Cost/latency are surfaced in the response contract per §8.
//
// Body:
//   {
//     mode: "single" | "backfill" | "manual",
//     source_table: "regulatory_clauses" | "knowledge_chunks" |
//                   "knowledge_documents" | "opportunities" |
//                   "memory_entries",
//     target_ids?: string[],        // required for single/manual
//     force_reembed?: boolean,      // default false
//     batch_size?: number           // default 40, capped server-side
//   }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  buildTextForRow,
  selectColumnsFor,
  SOURCE_TABLES,
  SourceTable,
} from "../_shared/embeddingSources.ts";
import {
  embedBatch,
  EMBEDDING_MODEL,
  EmbeddingProviderError,
  toPgVectorLiteral,
} from "../_shared/embeddingClient.ts";

// ADR-0010 §6: hard cap on batch size, enforced server-side and not
// overridable by callers. OpenAI's embeddings endpoint accepts up to
// 2048 inputs per request; we cap much lower for predictable memory
// use inside the edge function.
const DEFAULT_BATCH_SIZE = 40;
const MAX_BATCH_SIZE = 200;

// ADR-0010 §6 audit sink. All embedding-pipeline-run invocations are
// attributed to the sentinel "Platform" organisation because the source
// tables (regulatory_clauses, knowledge_chunks) are global with no
// natural organisation, and audit_events.organisation_id is NOT NULL.
// Approved by Product Owner alongside ADR-0010.
const PLATFORM_ORG_ID = "00000000-0000-0000-0000-0000000ad010";

type Mode = "single" | "backfill" | "manual";

interface RequestBody {
  mode: Mode;
  source_table: SourceTable;
  target_ids?: string[];
  force_reembed?: boolean;
  batch_size?: number;
}

interface FailureItem {
  id: string;
  reason: string;
}

interface ResponseBody {
  source_table: SourceTable;
  mode: Mode;
  processed: number;
  skipped_already_embedded: number;
  failed: number;
  failures: FailureItem[];
  total_tokens: number;
  estimated_cost_usd: number;
  duration_ms: number;
}

Deno.serve(async (req: Request) => {
  const started = performance.now();

  if (req.method !== "POST") {
    return jsonError(405, "method_not_allowed", "POST only");
  }

  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return jsonError(400, "bad_request", "invalid JSON body");
  }

  const validation = validateBody(body);
  if (validation) return validation;

  const admin = supabaseAdmin();

  try {
    await assertPlatformCaller(req, admin);
  } catch (err) {
    const msg = (err as Error).message;
    const status = msg.startsWith("unauthorized") ? 401 : 403;
    return jsonError(status, status === 401 ? "unauthorized" : "forbidden", msg);
  }

  const batchSize = clampBatchSize(body.batch_size);
  const forceReembed = body.force_reembed === true;

  const response: ResponseBody = {
    source_table: body.source_table,
    mode: body.mode,
    processed: 0,
    skipped_already_embedded: 0,
    failed: 0,
    failures: [],
    total_tokens: 0,
    estimated_cost_usd: 0,
    duration_ms: 0,
  };

  try {
    const rows = await loadRows(admin, body, forceReembed);
    // ADR-0010 §9 step 1: backfill mode drops already-embedded rows via
    // WHERE embedding IS NULL (unless force_reembed). For single/manual
    // modes force_reembed=false skips rows that already have an
    // embedding, and each skip counts toward skipped_already_embedded.
    const workable: Array<{ id: string; text: string }> = [];
    for (const row of rows) {
      if (!forceReembed && row.embedding != null) {
        response.skipped_already_embedded++;
        continue;
      }
      const text = buildTextForRow(body.source_table, row);
      if (text === null) {
        response.failed++;
        response.failures.push({
          id: String(row.id),
          reason: "text field is null or empty — nothing to embed",
        });
        continue;
      }
      workable.push({ id: String(row.id), text });
    }

    // ADR-0010 §9 step 3: batch up to batch_size per provider API call.
    for (let i = 0; i < workable.length; i += batchSize) {
      const slice = workable.slice(i, i + batchSize);
      try {
        const result = await embedBatch(slice.map((r) => r.text));
        const embeddedAt = new Date().toISOString();
        const rowsPayload = slice.map((r, idx) => ({
          id: r.id,
          embedding: toPgVectorLiteral(result.vectors[idx]),
        }));

        // ADR-0010 §9 step 4: single transaction per batch.
        const { data: updated, error: rpcErr } = await admin.rpc(
          "apply_embedding_batch",
          {
            p_source_table: body.source_table,
            p_model: result.model || EMBEDDING_MODEL,
            p_embedded_at: embeddedAt,
            p_rows: rowsPayload,
          },
        );
        if (rpcErr) {
          for (const r of slice) {
            response.failed++;
            response.failures.push({
              id: r.id,
              reason: `apply_embedding_batch failed: ${rpcErr.message}`,
            });
          }
          continue;
        }
        response.processed += Number(updated ?? slice.length);
        response.total_tokens += result.totalTokens;
        response.estimated_cost_usd += result.estimatedCostUsd;
      } catch (err) {
        // ADR-0010 §8: on partial failure the function must not fail the
        // whole batch. Successful earlier batches stay committed;
        // failures of this batch's rows are reported individually and
        // are retriable by a follow-up call.
        const reason = err instanceof EmbeddingProviderError
          ? `provider error (${err.status}): ${err.message}`
          : `unexpected error: ${(err as Error).message}`;
        for (const r of slice) {
          response.failed++;
          response.failures.push({ id: r.id, reason });
        }
      }
    }

    response.duration_ms = Math.round(performance.now() - started);

    await writeAuditEvent(admin, body, response);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return jsonError(500, "internal_error", (err as Error).message);
  }
});

// --- helpers ---------------------------------------------------------------

function jsonError(status: number, code: string, message: string): Response {
  return new Response(
    JSON.stringify({ error: { code, message } }),
    { status, headers: { "content-type": "application/json" } },
  );
}

function validateBody(body: RequestBody | undefined): Response | null {
  if (!body || typeof body !== "object") {
    return jsonError(400, "bad_request", "request body is required");
  }
  if (body.mode !== "single" && body.mode !== "backfill" && body.mode !== "manual") {
    return jsonError(400, "bad_request", "mode must be 'single', 'backfill', or 'manual'");
  }
  if (!SOURCE_TABLES.includes(body.source_table)) {
    return jsonError(
      400,
      "bad_request",
      `source_table must be one of: ${SOURCE_TABLES.join(", ")}`,
    );
  }
  if (body.mode === "single" || body.mode === "manual") {
    if (!Array.isArray(body.target_ids) || body.target_ids.length === 0) {
      return jsonError(
        400,
        "bad_request",
        `target_ids is required for mode='${body.mode}'`,
      );
    }
    if (!body.target_ids.every((id) => typeof id === "string" && id.length > 0)) {
      return jsonError(400, "bad_request", "target_ids must be an array of non-empty strings");
    }
  }
  if (body.batch_size !== undefined) {
    if (typeof body.batch_size !== "number" || !Number.isFinite(body.batch_size) || body.batch_size < 1) {
      return jsonError(400, "bad_request", "batch_size must be a positive integer");
    }
  }
  return null;
}

function clampBatchSize(requested: number | undefined): number {
  if (requested === undefined) return DEFAULT_BATCH_SIZE;
  const n = Math.floor(requested);
  if (n < 1) return DEFAULT_BATCH_SIZE;
  return Math.min(n, MAX_BATCH_SIZE);
}

// ADR-0010 §6: caller must be service_role or a profile with
// is_platform_operator=true. verify_jwt=true (config.toml) already
// establishes the JWT is signed by this Supabase project; this function
// additionally checks WHO the caller is and refuses anyone who isn't
// explicitly authorised for platform operations.
async function assertPlatformCaller(req: Request, admin: SupabaseClient): Promise<void> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("unauthorized: missing Authorization header");

  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("unauthorized: empty bearer token");

  // Fast path: the service role key is a JWT whose payload has
  // `role: 'service_role'`. Resolving it via auth.getUser returns no
  // user (it's a role, not a user), so we sniff the payload first.
  const claimRole = readJwtRole(token);
  if (claimRole === "service_role") return;

  // Otherwise treat it as a user token and require is_platform_operator.
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await anon.auth.getUser();
  if (userErr || !userData?.user) throw new Error("unauthorized: invalid token");

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("is_platform_operator")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileErr || !profile) {
    throw new Error("forbidden: caller has no profile");
  }
  if (profile.is_platform_operator !== true) {
    throw new Error("forbidden: caller is not a platform operator");
  }
}

function readJwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1] + "==".slice((2 - parts[1].length * 3 % 4) % 4);
    const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

async function loadRows(
  admin: SupabaseClient,
  body: RequestBody,
  forceReembed: boolean,
): Promise<Array<Record<string, unknown>>> {
  const cols = `${selectColumnsFor(body.source_table)},embedding`;
  let query = admin.from(body.source_table).select(cols);

  if (body.mode === "single" || body.mode === "manual") {
    query = query.in("id", body.target_ids!);
  } else {
    // backfill
    if (!forceReembed) {
      query = query.is("embedding", null);
    }
  }
  const { data, error } = await query;
  if (error) throw new Error(`failed to load rows from ${body.source_table}: ${error.message}`);
  return (data ?? []) as Array<Record<string, unknown>>;
}

async function writeAuditEvent(
  admin: SupabaseClient,
  body: RequestBody,
  response: ResponseBody,
): Promise<void> {
  // ADR-0010 §6: one row per invocation summarising the batch. detail
  // stays batch-level (counts, cost, duration), not per-row — keeps the
  // audit table from being dominated by embedding noise.
  const { error } = await admin.from("audit_events").insert({
    organisation_id: PLATFORM_ORG_ID,
    actor_type: "system",
    action: "embedding_generated",
    target_type: body.source_table,
    detail: {
      mode: body.mode,
      source_table: body.source_table,
      model: EMBEDDING_MODEL,
      processed: response.processed,
      skipped_already_embedded: response.skipped_already_embedded,
      failed: response.failed,
      total_tokens: response.total_tokens,
      estimated_cost_usd: response.estimated_cost_usd,
      duration_ms: response.duration_ms,
    },
  });
  if (error) {
    console.error("[embedding-pipeline-run] audit_events insert failed:", error.message);
  }
}
