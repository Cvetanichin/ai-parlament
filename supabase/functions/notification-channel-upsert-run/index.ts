// POST /notification-channel-upsert-run
// Notification Engine — create/update a notification channel (Platform
// Services spec §5, Security spec §5). The sensitive part of `config`
// (a webhook URL, an SMTP password) is never written to the plain jsonb
// `config` column — it goes through `public.notification_channel_set_secret`
// (migration 22), a SECURITY DEFINER wrapper around Supabase Vault, and
// only `config_secret_id` is stored in the row. `config` itself holds only
// non-sensitive display fields (e.g. a masked "sends to #compliance-alerts"
// label) — the caller decides what's safe to put there; this function
// never inspects or validates that split beyond not accepting a
// `secretValue` field inside `config` itself.
//
// owner/admin only — channel configuration is an organisation-level
// setting, not a per-notification-rule action (Security spec §5).
//
// Body: { projectId, channelId?, channelType?, config?, userId?, active?, secretValue? }
// channelId omitted = create; provided = update. secretValue, if
// supplied, is written via the Vault RPC and never echoed back in the
// response.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";

const CHANNEL_TYPES = ["email", "slack", "teams", "push"];

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, channelId, channelType, config, userId, active, secretValue } = body;
    if (!projectId) {
      return new Response(JSON.stringify({ error: { code: "bad_request", message: "projectId is required" } }), { status: 400 });
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);
    if (!["owner", "admin"].includes(caller.role)) {
      return new Response(
        JSON.stringify({ error: { code: "forbidden", message: "notification channel configuration requires 'owner' or 'admin' role" } }),
        { status: 403 },
      );
    }

    let resolvedChannelId: string;

    if (channelId) {
      const { data: existing, error: existingErr } = await admin
        .from("notification_channels")
        .select("id, organisation_id")
        .eq("id", channelId)
        .single();
      if (existingErr || !existing) {
        return new Response(JSON.stringify({ error: { code: "not_found", message: "notification channel not found" } }), { status: 404 });
      }
      if (existing.organisation_id !== caller.organisationId) {
        return new Response(JSON.stringify({ error: { code: "forbidden", message: "channel belongs to a different organisation" } }), { status: 403 });
      }

      const updates: Record<string, unknown> = {};
      if (config !== undefined) updates.config = config;
      if (active !== undefined) updates.active = active;
      if (Object.keys(updates).length > 0) {
        const { error: updateErr } = await admin.from("notification_channels").update(updates).eq("id", channelId);
        if (updateErr) throw updateErr;
      }
      resolvedChannelId = channelId;
    } else {
      if (!channelType || !CHANNEL_TYPES.includes(channelType)) {
        return new Response(
          JSON.stringify({ error: { code: "bad_request", message: `channelType must be one of: ${CHANNEL_TYPES.join(", ")}` } }),
          { status: 400 },
        );
      }
      const { data: created, error: createErr } = await admin
        .from("notification_channels")
        .insert({
          organisation_id: caller.organisationId,
          user_id: userId ?? null,
          channel_type: channelType,
          config: config ?? {},
          active: active ?? true,
        })
        .select("id")
        .single();
      if (createErr) throw createErr;
      resolvedChannelId = created.id;
    }

    let secretStored = false;
    if (secretValue) {
      const { error: secretErr } = await admin.rpc("notification_channel_set_secret", {
        p_channel_id: resolvedChannelId,
        p_secret: secretValue,
      });
      if (secretErr) throw secretErr;
      secretStored = true;
    }

    await admin.from("audit_events").insert({
      organisation_id: caller.organisationId,
      actor_type: "human",
      actor_id: caller.userId,
      action: "notification_channel_upserted",
      target_type: "notification_channel",
      target_id: resolvedChannelId,
      detail: { channelType: channelType ?? null, secretStored, wasCreate: !channelId },
    });

    return new Response(JSON.stringify({ channelId: resolvedChannelId, secretStored }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
