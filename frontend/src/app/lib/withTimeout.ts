// Generic guard against a silently-hung promise — Supabase's JS client (both
// auth.* and the postgrest query builder) has no built-in per-call timeout,
// so a down/unresponsive local stack previously left callers stuck forever
// with no error and nothing in the console (the exact symptom that surfaced
// this: signup stuck on "Creating account…" with a fully quiet console).
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} did not respond within ${ms / 1000}s — the local Supabase stack may be down or unresponsive.`)), ms),
    ),
  ]);
}
