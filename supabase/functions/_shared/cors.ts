// Every Edge Function in this repo was built and exercised server-to-server
// (curl, service-role JWTs) across prior sessions -- none of that ever
// triggers a browser CORS preflight, so no function here handled OPTIONS or
// set Access-Control-Allow-* headers. grant-studio-web is the first real
// browser caller, and every call failed at the preflight with an opaque
// "Failed to fetch" (confirmed live, 2026-07-24): verify_jwt lets an
// OPTIONS request through to the function unauthenticated, but this
// function's own method check ("POST only") then returned a 405 with no
// CORS headers, which the browser rejects before the real request is ever
// sent.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

// Wraps a Deno.serve handler: short-circuits the OPTIONS preflight and
// stamps CORS headers onto every real response (success or error), without
// requiring every individual `new Response(...)` call site in a function
// to be touched.
export function withCors(handler: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const response = await handler(req);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
    return new Response(response.body, { status: response.status, headers });
  };
}
