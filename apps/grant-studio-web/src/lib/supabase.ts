import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

// persistSession/autoRefreshToken true — unlike the root error-handling-demo
// (which never authenticates), Grant Studio is a real, authenticated app:
// RLS on every real EAS table keys off auth.uid() via organisation_members.
export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: { persistSession: true, autoRefreshToken: true },
});
