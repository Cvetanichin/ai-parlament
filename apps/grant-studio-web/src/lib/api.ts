import { supabase } from "@/lib/supabase";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// Thin wrapper over supabase.functions.invoke -- the Authorization header is
// attached automatically from the current session (docs/13-Frontend §2's
// Gateway path: anything that orchestrates across services or enforces a
// business rule beyond row-level access goes through an Edge Function, not
// a direct table write).
export async function callEdgeFunction<TResponse>(name: string, body: Record<string, unknown>): Promise<TResponse> {
  const { data, error } = await supabase.functions.invoke<TResponse>(name, { body });
  if (error) {
    // FunctionsHttpError carries the real response on `context` -- surface
    // the structured { error: { code, message } } body edge functions in
    // this repo return, not just the generic "non-2xx" message.
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const parsed = await context.clone().json();
        if (parsed?.error?.code) {
          throw new ApiError(parsed.error.code, parsed.error.message ?? error.message, context.status);
        }
      } catch {
        // fall through to generic error below
      }
    }
    throw new ApiError("unknown", error.message, 500);
  }
  return data as TResponse;
}

// GET edge functions (eligibility-report-get) take query params, not a
// body -- supabase.functions.invoke() never appends query params to the
// URL (it only ever POSTs/GETs against `${functionsUrl}/${name}`), so a
// GET-with-query-string call has to go through a plain fetch instead,
// attaching the same Authorization header invoke() would have used.
export async function callEdgeFunctionGet<TResponse>(name: string, params: Record<string, string>): Promise<TResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
  });
  const parsed = await res.json();
  if (!res.ok) {
    throw new ApiError(parsed?.error?.code ?? "unknown", parsed?.error?.message ?? res.statusText, res.status);
  }
  return parsed as TResponse;
}
