// POST /notification-dispatch-run
// Notification Engine — dispatches one platform_events row against its
// organisation's notification_rules (Platform Services spec §5). Callable
// either by a human/admin re-triggering delivery, or by a system caller
// (service_role — auth.ts's fast path, same shape as ADR-0009 §4 Phase
// C.3's shadow trigger) wiring this to fire automatically off eventBus.ts's
// publishEvent in a future phase; nothing in this slice wires that
// trigger yet — this function only handles being called, not calling
// itself.
//
// Delivery is mocked exactly like llmGateway.ts mocks an LLM call when no
// provider key is configured: with no Vault-backed channel secret (a
// webhook URL) configured, this logs `status: 'sent'` with a `(mock)`-
// prefixed error_message note rather than fabricating a real HTTP call —
// the whole platform stays demoable with zero external dependencies,
// matching this codebase's established pattern for every other outbound
// integration. A configured secret gets a real `fetch()` POST.
//
// digest delivery_modes ('daily_digest'/'weekly_digest') have no
// aggregator built in this slice — logged as 'suppressed_digest_pending'
// and left there, matching ADR-0010's own "deferred, not built ad hoc"
// precedent for anything requiring a scheduler this session doesn't add.
//
// Body: { projectId, platformEventId }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, platformEventId } = body;
    if (!projectId || !platformEventId) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "projectId, platformEventId are required" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);

    const { data: event, error: eventErr } = await admin
      .from("platform_events")
      .select("id, organisation_id, event_type, payload")
      .eq("id", platformEventId)
      .single();
    if (eventErr || !event) {
      return new Response(JSON.stringify({ error: { code: "not_found", message: "platform event not found" } }), { status: 404 });
    }
    if (event.organisation_id !== caller.organisationId) {
      return new Response(JSON.stringify({ error: { code: "forbidden", message: "event belongs to a different organisation" } }), { status: 403 });
    }

    const { data: rules, error: rulesErr } = await admin
      .from("notification_rules")
      .select("id, channel_id, delivery_mode")
      .eq("organisation_id", event.organisation_id)
      .eq("event_type", event.event_type);
    if (rulesErr) throw rulesErr;

    const results: Array<{ ruleId: string; channelId: string; status: string; errorMessage: string | null }> = [];

    for (const rule of rules ?? []) {
      if (rule.delivery_mode !== "immediate") {
        const { error: logErr } = await admin.from("notification_log").insert({
          organisation_id: event.organisation_id,
          platform_event_id: event.id,
          channel_id: rule.channel_id,
          status: "suppressed_digest_pending",
        });
        if (logErr) throw logErr;
        results.push({ ruleId: rule.id, channelId: rule.channel_id, status: "suppressed_digest_pending", errorMessage: null });
        continue;
      }

      const { data: channel } = await admin
        .from("notification_channels")
        .select("id, channel_type, config, config_secret_id, active")
        .eq("id", rule.channel_id)
        .maybeSingle();
      if (!channel || !channel.active) {
        results.push({ ruleId: rule.id, channelId: rule.channel_id, status: "failed", errorMessage: "channel not found or inactive" });
        continue;
      }

      let status: "sent" | "failed" = "sent";
      let errorMessage: string | null = null;

      if (channel.config_secret_id && (channel.channel_type === "slack" || channel.channel_type === "teams")) {
        const { data: webhookUrl, error: secretErr } = await admin.rpc("notification_channel_get_secret", {
          p_channel_id: channel.id,
        });
        if (secretErr || !webhookUrl) {
          status = "failed";
          errorMessage = "channel secret configured but could not be decrypted";
        } else {
          try {
            const res = await fetch(webhookUrl as string, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ text: `[${event.event_type}] ${JSON.stringify(event.payload)}` }),
            });
            if (!res.ok) {
              status = "failed";
              errorMessage = `webhook returned HTTP ${res.status}`;
            }
          } catch (fetchErr) {
            status = "failed";
            errorMessage = `webhook delivery failed: ${(fetchErr as Error).message}`;
          }
        }
      } else {
        errorMessage = "(mock) no channel secret configured — no real delivery attempted";
      }

      const { error: logErr } = await admin.from("notification_log").insert({
        organisation_id: event.organisation_id,
        platform_event_id: event.id,
        channel_id: channel.id,
        status,
        sent_at: status === "sent" ? new Date().toISOString() : null,
        error_message: errorMessage,
      });
      if (logErr) throw logErr;

      results.push({ ruleId: rule.id, channelId: rule.channel_id, status, errorMessage });
    }

    return new Response(JSON.stringify({ platformEventId, dispatched: results.length, results }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
