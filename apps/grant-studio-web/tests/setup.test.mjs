import test from "node:test";
import assert from "node:assert/strict";
import { readSupabaseConfig } from "../src/lib/config.ts";
import { responseError } from "../src/lib/apiErrors.ts";

const project = "https://example.supabase.co";
const key = "sb_publishable_test";
const jwt = (role) => `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;

test("missing or unsafe build configuration fails before startup", () => {
  assert.throws(() => readSupabaseConfig({}), /Set VITE_SUPABASE/);
  for (const value of ["not a url", "ftp://example.org", `${project}/rest/v1`, `${project}?apikey=secret`]) {
    assert.throws(() => readSupabaseConfig({ VITE_SUPABASE_URL: value, VITE_SUPABASE_ANON_KEY: key }));
  }
  for (const value of ["sb_secret_test", jwt("service_role"), "placeholder"]) {
    assert.throws(() => readSupabaseConfig({ VITE_SUPABASE_URL: project, VITE_SUPABASE_ANON_KEY: value }));
  }
});

test("modern public keys and legacy anon configuration both work", () => {
  assert.deepEqual(readSupabaseConfig({ VITE_SUPABASE_URL: `${project}/`, VITE_SUPABASE_PUBLISHABLE_KEY: key }), { url: project, key });
  assert.equal(readSupabaseConfig({ VITE_SUPABASE_URL: project, VITE_SUPABASE_ANON_KEY: jwt("anon") }).key, jwt("anon"));
});

test("structured backend errors keep the HTTP status and actionable message", async () => {
  const error = await responseError(Response.json({ error: { code: "gate_precondition_unmet", message: "Approve the Go/No-Go gate first." } }, { status: 409 }), "Non-2xx response");
  assert.equal(error.status, 409);
  assert.equal(error.code, "gate_precondition_unmet");
  assert.equal(error.message, "Approve the Go/No-Go gate first.");
});

test("proxy HTML and gateway errors retain their HTTP status", async () => {
  const html = await responseError(new Response("<h1>Forbidden</h1>", { status: 403 }), "Network access denied");
  assert.equal(html.status, 403);
  assert.equal(html.message, "Network access denied");
  const gateway = await responseError(Response.json({ message: "Invalid JWT" }, { status: 401 }), "Non-2xx response");
  assert.equal(gateway.status, 401);
  assert.equal(gateway.message, "Invalid JWT");
});
