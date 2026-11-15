import { loadEnv } from "vite";
import { readSupabaseConfig } from "../src/lib/config.ts";

const config = readSupabaseConfig({ ...loadEnv("production", process.cwd(), "VITE_"), ...process.env });
const headers = { apikey: config.key };
async function request(path, options = {}) {
  const response = await fetch(`${config.url}${path}`, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(15000) });
  return response;
}
const settings = await request("/auth/v1/settings");
if (!settings.ok) throw new Error(`Supabase Auth settings returned HTTP ${settings.status}`);
const auth = await settings.json();
if (!auth.external?.email) throw new Error("Email authentication is not enabled.");
console.log("PASS: Supabase Auth reachable; email authentication enabled.");

// Exercise the hosted redirect allowlist without sending email or using a real
// user's recovery token. Invalid tokens should return an error to our callback,
// rather than falling back to the project's default localhost Site URL.
if (process.env.VERCEL_URL) {
  const callback = new URL("/reset-password", `https://${process.env.VERCEL_URL}`);
  const verify = new URL("/auth/v1/verify", config.url);
  verify.searchParams.set("token", "grant-studio-synthetic-invalid-redirect-check");
  verify.searchParams.set("type", "recovery");
  verify.searchParams.set("redirect_to", callback.toString());
  const response = await fetch(verify, { headers, redirect: "manual", signal: AbortSignal.timeout(15000) });
  const location = response.headers.get("location");
  if (![302, 303, 307].includes(response.status) || !location) {
    throw new Error(`Supabase recovery redirect check returned unexpected HTTP ${response.status}.`);
  }
  const destination = new URL(location);
  if (destination.origin !== callback.origin || destination.pathname !== callback.pathname) {
    throw new Error(`Supabase rejected the preview recovery callback and redirected to ${destination.origin}${destination.pathname}. Add this project's preview URLs to Auth Redirect URLs.`);
  }
  console.log("PASS: Supabase recovery redirects to this preview's reset-password page, not localhost (synthetic invalid token; no email or password changes).");
}

for (const table of ["opportunities", "proposals", "organisation_members"]) {
  const response = await request(`/rest/v1/${table}?select=*&limit=1`);
  if (!response.ok) throw new Error(`${table} Data API returned HTTP ${response.status}`);
  if ((await response.json()).length !== 0) throw new Error(`${table} exposes rows without signing in.`);
  console.log(`PASS: ${table} Data API reachable; anonymous reads return no rows.`);
}
const bootstrap = await request("/rest/v1/rpc/bootstrap_own_organisation", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
if (![401, 403].includes(bootstrap.status)) throw new Error(`Anonymous bootstrap returned unexpected HTTP ${bootstrap.status}`);
console.log("PASS: anonymous organisation bootstrap denied.");

// Satisfy request validation so each request reaches its authentication check.
// These synthetic IDs do not refer to test fixtures or create database records.
const projectId = "fa6e39cc-d376-4f63-ae2c-20fb22dfaa9a";
const opportunityId = "703c5bf6-aa69-4cb4-97bf-ad98e9079ea6";
const workflowInstanceId = "c9aca5d5-bdf8-4fe6-a69b-a12f053e88e6";
for (const name of ["eligibility-report-get", "eligibility-report-run", "workflow-research-run", "workflow-governance-run", "workflow-gate-decide"]) {
  const method = name === "eligibility-report-get" ? "GET" : "POST";
  const preflight = await request(`/functions/v1/${name}`, { method: "OPTIONS", headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": method, "Access-Control-Request-Headers": "authorization,apikey,content-type" } });
  if (preflight.status !== 204 || !preflight.headers.get("access-control-allow-origin")) throw new Error(`${name} CORS preflight failed: HTTP ${preflight.status}`);
  const params = method === "GET" ? `?projectId=${projectId}&opportunityId=${opportunityId}` : "";
  const unauthenticated = await request(`/functions/v1/${name}${params}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(method === "POST" ? { body: JSON.stringify({ projectId, opportunityId, workflowInstanceId, brief: "Synthetic authentication check", constraints: {}, gateType: "go_no_go", decision: "rejected" }) } : {}),
  });
  if (unauthenticated.status !== 401) throw new Error(`${name} authentication check returned unexpected HTTP ${unauthenticated.status}`);
  console.log(`PASS: ${name} CORS and JWT authentication checks.`);
}
