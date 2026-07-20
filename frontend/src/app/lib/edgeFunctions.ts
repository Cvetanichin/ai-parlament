import { supabase } from "./supabaseClient";

// Every Edge Function built this session (supabase/functions/*/index.ts) shares
// the exact same contract: POST, JSON body, Authorization: Bearer <session JWT>,
// and on failure a { error: { code, message } } envelope with a matching HTTP
// status. This is the one place that contract is encoded on the frontend side —
// Frontend spec §2's "API Gateway calls" path (there is no API Gateway process
// yet, docs/12-APIs/'s catalog is not implemented as a real service — this calls
// the Edge Functions directly, which is what actually exists).
export class EdgeFunctionError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const TIMEOUT_MS = 15_000;

export async function invokeEdgeFunction<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new EdgeFunctionError("unauthorized", "No active session — sign in again.", 401);

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    // A hung Edge Function (no response, ever) previously left callers stuck
    // indefinitely with no error and nothing in the console — this is what
    // actually surfaces that failure instead of a silent infinite spinner.
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new EdgeFunctionError("timeout", `${functionName} did not respond within ${TIMEOUT_MS / 1000}s — the local Supabase stack may be down or unresponsive.`, 0);
    }
    throw new EdgeFunctionError("network_error", `${functionName}: ${err instanceof Error ? err.message : String(err)}`, 0);
  } finally {
    clearTimeout(timer);
  }

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const err = json?.error;
    throw new EdgeFunctionError(err?.code ?? "unknown_error", err?.message ?? `${functionName} failed with status ${res.status}`, res.status);
  }

  return json as T;
}
