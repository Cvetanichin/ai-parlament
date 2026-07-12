// Service-role Supabase client for Edge Function internal use.
// Per Backend spec §4: service-role access is for platform-internal
// operations (writing audit events, agent runs), never a general
// impersonate-any-user bypass exposed to a client.
import { createClient } from "jsr:@supabase/supabase-js@2";

export function supabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
