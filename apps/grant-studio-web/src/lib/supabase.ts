import { createClient } from "@supabase/supabase-js";
import { readSupabaseConfig } from "./config";

export const supabaseConfig = readSupabaseConfig(import.meta.env);
// Capture this before the SDK consumes and removes the callback fragment.
const callback = new URLSearchParams(window.location.hash.slice(1));
export const initialPasswordRecovery = callback.get("type") === "recovery";
export const initialAuthLinkError = callback.has("error")
  ? "This email link is invalid, expired, or has already been used. Request a new one."
  : null;

// persistSession/autoRefreshToken true — unlike the root error-handling-demo
// (which never authenticates), Grant Studio is a real, authenticated app:
// RLS on every real EAS table keys off auth.uid() via organisation_members.
export const supabase = createClient(supabaseConfig.url, supabaseConfig.key, {
  auth: { persistSession: true, autoRefreshToken: true },
});
