import test from "node:test";
import assert from "node:assert/strict";
import { authErrorMessage, parseEmailLink, passwordValidationError } from "../src/lib/passwordRecovery.ts";

const project = "https://example.supabase.co";
test("reset validation refuses weak or mismatched passwords", () => {
  assert.match(passwordValidationError("short", "short"), /8 characters/);
  assert.match(passwordValidationError("long-enough", "different"), /do not match/);
  assert.equal(passwordValidationError("long-enough", "long-enough"), null);
});
test("recovery link is verified on the configured backend without visiting its redirect", () => {
  assert.deepEqual(parseEmailLink(`${project}/auth/v1/verify?token=synthetic&type=recovery&redirect_to=http://localhost:3000`, project), { token_hash: "synthetic", type: "recovery" });
  assert.deepEqual(parseEmailLink(`${project}/auth/v1/verify?token_hash=synthetic&type=signup`, project), { token_hash: "synthetic", type: "signup" });
});
test("links from another backend, other operations, or missing tokens fail closed", () => {
  for (const link of ["not a URL", "https://other.supabase.co/auth/v1/verify?token=x&type=recovery", `${project}/auth/v1/verify?token=x&type=invite`, `${project}/auth/v1/verify?type=recovery`, `${project}/elsewhere?token=x&type=recovery`]) {
    assert.throws(() => parseEmailLink(link, project));
  }
});
test("expired links, missing accounts and email throttling have actionable messages", () => {
  assert.match(authErrorMessage({ code: "otp_expired" }), /Request a new one/);
  assert.match(authErrorMessage({ code: "invalid_credentials" }), /sign up first/);
  assert.match(authErrorMessage({ code: "email_not_confirmed" }), /Confirm your email/);
  assert.match(authErrorMessage({ code: "over_email_send_rate_limit" }), /Wait a few minutes/);
});

const recoveryToken = (issuer) => `header.${Buffer.from(JSON.stringify({ iss: issuer })).toString("base64url")}.synthetic-signature`;
test("an already-opened localhost recovery callback can restore its own project session", () => {
  const token = recoveryToken(`${project}/auth/v1`);
  const callback = `http://localhost:3000/#access_token=${token}&refresh_token=synthetic-refresh&type=recovery`;
  assert.deepEqual(parseEmailLink(callback, project), { access_token: token, refresh_token: "synthetic-refresh", type: "recovery" });
});
test("redirected callback refuses foreign issuers, incomplete sessions and unrelated URLs", () => {
  const token = recoveryToken(`${project}/auth/v1`);
  for (const callback of [
    `http://localhost:3000/#access_token=${recoveryToken("https://other.supabase.co/auth/v1")}&refresh_token=x&type=recovery`,
    `http://localhost:3000/#access_token=${token}&type=recovery`,
    `http://localhost:3000/#access_token=${token}&refresh_token=x&type=signup`,
    `https://attacker.example/#access_token=${token}&refresh_token=x&type=recovery`,
    `http://localhost:3000/other#access_token=${token}&refresh_token=x&type=recovery`,
  ]) assert.throws(() => parseEmailLink(callback, project));
});
