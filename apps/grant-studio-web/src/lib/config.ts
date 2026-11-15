export function readSupabaseConfig(env: Record<string, string | undefined>) {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY)?.trim();
  if (!url || !key) {
    throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY) in .env.local or your hosting environment.");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("VITE_SUPABASE_URL must be a valid HTTP(S) URL.");
  }
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error("VITE_SUPABASE_URL must be the project origin without credentials, paths, or query parameters.");
  }
  let legacyRole: string | undefined;
  try {
    const payload = key.split(".")[1];
    if (payload) legacyRole = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).role;
  } catch { /* Not a legacy JWT key. */ }
  if (key.startsWith("sb_secret_") || legacyRole === "service_role") {
    throw new Error("Grant Studio requires a public publishable or anon key. Never use a service-role or secret key in VITE_ variables.");
  }
  if (!key.startsWith("sb_publishable_") && legacyRole !== "anon") {
    throw new Error("Use a Supabase publishable key (sb_publishable_...) or legacy anon JWT key.");
  }
  return { url: parsed.origin, key };
}
