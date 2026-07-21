// Event Bus — Platform Services spec §2 (Event Bus + Supabase Realtime).
// `platform_events` is append-only (update/delete revoked from
// authenticated, migration 07) — this is the sole write path used across
// this codebase's callers. Publish calls are wired at the highest
// signal-to-noise points already established in this codebase (gate
// decisions, veto failures, submission), not every write path — the same
// bounded-scope judgment call this session's other additions made
// explicit rather than silently narrowing.
//
// Realtime consumption (a client subscribing to platform_events changes)
// is Supabase's own out-of-the-box feature once a table is in a realtime
// publication — no application code needed on the consumer side beyond
// this write path existing. Nothing here manages that subscription.
import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface PublishEventParams {
  supabase: SupabaseClient;
  organisationId: string;
  eventType: string;
  sourceService: string;
  targetType?: string;
  targetId?: string;
  payload?: Record<string, unknown>;
}

export async function publishEvent(params: PublishEventParams): Promise<string> {
  const { supabase, organisationId, eventType, sourceService, targetType, targetId, payload } = params;
  const { data, error } = await supabase
    .from("platform_events")
    .insert({
      organisation_id: organisationId,
      event_type: eventType,
      source_service: sourceService,
      target_type: targetType ?? null,
      target_id: targetId ?? null,
      payload: payload ?? {},
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}
