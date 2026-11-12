// POST /workspace-action-gateway: propose or approve a version-bound action.
// This endpoint NEVER executes an external action. A separate allowlisted
// executor must verify approval and destination state before acting.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller, requireGateRole } from "../_shared/auth.ts";
import { withCors } from "../_shared/cors.ts";

const OPERATIONS: Record<string, string[]> = {
  google_drive: ["create_file", "update_file", "move_file"],
  gmail: ["create_draft", "send_email"],
  google_calendar: ["create_event", "update_event", "cancel_event"],
  github: ["create_branch", "create_file", "update_file", "create_pull_request", "merge_pull_request"],
  portal: ["prepare_application", "submit_application"],
};
const ALWAYS_APPROVE = new Set(["gmail:send_email", "portal:submit_application"]);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const body = await req.json();
    const projectId = String(body.projectId || "");
    if (!projectId) return json({ error: "projectId is required" }, 400);
    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);
    // Existing auth helper supports system/service callers for triggers.
    // Explicitly deny those for initiating or approving external actions.
    if (caller.userId === "system") return json({ error: "human session required" }, 403);

    if (body.command === "propose") {
      const service = String(body.service || "");
      const operation = String(body.operation || "");
      if (!OPERATIONS[service]?.includes(operation)) {
        return json({ error: "unsupported service/operation" }, 422);
      }
      if (typeof body.resourceLocator !== "string" || !body.resourceLocator.trim() ||
          typeof body.idempotencyKey !== "string" || !body.idempotencyKey.trim() ||
          typeof body.payload !== "object" || body.payload === null || Array.isArray(body.payload)) {
        return json({ error: "resourceLocator, idempotencyKey, object payload are required" }, 400);
      }
      const required = ALWAYS_APPROVE.has(service + ":" + operation) ||
        body.requireApproval === true;
      const digest = await sha256({
        service, operation, resourceLocator: body.resourceLocator,
        payload: body.payload, artifactVersion: body.artifactVersion ?? null,
      });
      const { data, error } = await admin.from("workspace_external_actions")
        .insert({
          organisation_id: caller.organisationId, project_id: projectId,
          requested_by: caller.userId, task_external_id: body.workControlTaskId ?? null,
          service, operation, resource_locator: body.resourceLocator, payload: body.payload,
          payload_sha256: digest, artifact_version: body.artifactVersion ?? null,
          idempotency_key: body.idempotencyKey,
          risk_level: required ? "high" : "normal",
          approval_required: required,
          status: required ? "awaiting_approval" : "proposed",
        }).select("id,status,approval_required,payload_sha256").single();
      if (error) {
        if (error.code === "23505") return json({ error: "duplicate idempotency key" }, 409);
        throw error;
      }
      await admin.from("workspace_action_events").insert({
        action_id: data.id, actor_id: caller.userId,
        event_type: "proposed", details: { service, operation },
      });
      return json({ action: data }, 201);
    }

    if (body.command === "approve") {
      requireGateRole(caller);
      const actionId = String(body.actionId || "");
      const expectedDigest = String(body.expectedPayloadSha256 || "");
      if (!actionId || !expectedDigest) return json({ error: "actionId and expectedPayloadSha256 required" }, 400);
      const { data: action, error: readErr } = await admin.from("workspace_external_actions")
        .select("*").eq("id", actionId).eq("project_id", projectId)
        .eq("organisation_id", caller.organisationId).single();
      if (readErr || !action) return json({ error: "action not found" }, 404);
      if (action.status !== "awaiting_approval" || action.payload_sha256 !== expectedDigest) {
        return json({ error: "action changed or not awaiting approval" }, 409);
      }
      // No silent replacement of payload. Atomic state transition prevents
      // simultaneous approvals racing with cancellation.
      const { data: approved, error } = await admin.from("workspace_external_actions")
        .update({
          status: "approved", approval_actor: caller.userId,
          approval_at: new Date().toISOString(),
          approval_payload_sha256: expectedDigest,
        }).eq("id", actionId).eq("status", "awaiting_approval")
        .eq("payload_sha256", expectedDigest).select("id,status").maybeSingle();
      if (error) throw error;
      if (!approved) return json({ error: "state changed; approval rejected" }, 409);
      await admin.from("workspace_action_events").insert({
        action_id: actionId, actor_id: caller.userId, event_type: "approved",
        details: { payload_sha256: expectedDigest },
      });
      return json({ action: approved });
    }
    return json({ error: "unknown command" }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const status = message.startsWith("unauthorized") ? 401 :
      message.startsWith("forbidden") ? 403 : 500;
    return json({ error: message }, status);
  }
}));
