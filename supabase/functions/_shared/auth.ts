// Shared request-level authorization helper. Edge Functions run with
// verify_jwt=true (platform-level check that the bearer token is valid);
// this resolves *who* the caller is and *which organisation* they're
// acting for, since the functions below use the service-role client for
// their actual writes (Workflow Engine/Agent Runtime span multiple
// tables) and so must not rely on RLS alone for authorization.
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface CallerContext {
  userId: string;
  organisationId: string;
  role: string;
}

export async function resolveCaller(
  req: Request,
  admin: SupabaseClient,
  projectId: string,
): Promise<CallerContext> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("unauthorized: missing Authorization header");
  const token = authHeader.replace(/^Bearer\s+/i, "");

  // ADR-0009 §4 Phase C.3: the shadow-invocation trigger is a system-initiated
  // call with no real user session to present (a Postgres trigger/pg_net call
  // has no logged-in human behind it). Resolve organisationId from the project
  // row only; role is synthetic ("system"), never "owner"/"admin", so
  // requireGateRole below still correctly refuses it for workflow-gate-decide
  // — human gate decisions must never be reachable by an automated caller,
  // per EAS §9's Liability NFR. Mirrors embedding-pipeline-run's
  // assertPlatformCaller service_role fast path (ADR-0010 §6).
  if (readJwtRole(token) === "service_role") {
    const { data: project, error: projectErr } = await admin
      .from("projects")
      .select("organisation_id")
      .eq("id", projectId)
      .single();
    if (projectErr || !project?.organisation_id) {
      throw new Error("not_found: project has no organisation (multi-tenancy migration not backfilled for this row)");
    }
    return { userId: "system", organisationId: project.organisation_id, role: "system" };
  }

  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await anon.auth.getUser();
  if (userErr || !userData?.user) throw new Error("unauthorized: invalid token");

  const { data: project, error: projectErr } = await admin
    .from("projects")
    .select("organisation_id")
    .eq("id", projectId)
    .single();
  if (projectErr || !project?.organisation_id) {
    throw new Error("not_found: project has no organisation (multi-tenancy migration not backfilled for this row)");
  }

  const { data: membership, error: memberErr } = await admin
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", project.organisation_id)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (memberErr || !membership) {
    throw new Error("forbidden: caller is not a member of this project's organisation");
  }

  return { userId: userData.user.id, organisationId: project.organisation_id, role: membership.role };
}

// Decodes a JWT payload without verifying the signature — safe here only
// because these callers already hold a token Supabase Auth itself accepted
// (either via anon.auth.getUser() succeeding first, or because this is
// purely a role/AAL sniff used to route to the right verified check, never
// the sole authorization decision on its own).
function readJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1] + "==".slice((2 - (parts[1].length * 3) % 4) % 4);
    const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

// JWT payload role sniff — the service_role key is a JWT whose payload has
// role: 'service_role'; resolving it via auth.getUser() returns no user
// (it's a role, not a user), so this must be checked first.
function readJwtRole(token: string): string | null {
  const role = readJwtPayload(token)?.role;
  return typeof role === "string" ? role : null;
}

// Security spec §1: "MFA (TOTP) is required for any account with
// profiles.is_platform_operator = true." Supabase Auth's GoTrue encodes
// the Authenticator Assurance Level actually achieved this session as the
// JWT's `aal` claim ('aal1' = password only, 'aal2' = password + a second
// factor verified) — checking it here is the concrete enforcement
// mechanism, not just an enrolment reminder: a platform operator who has
// TOTP enrolled but is signed in on a session that never verified it is
// still aal1, and this rejects that.
function readJwtAal(token: string): string | null {
  const aal = readJwtPayload(token)?.aal;
  return typeof aal === "string" ? aal : null;
}

// Security spec §2.2: Human Gate decisions require owner/admin. A "system"
// role (service_role caller, above) is deliberately never owner/admin —
// this is what keeps the shadow trigger unable to ever reach a gate
// decision, not an incidental side effect.
export function requireGateRole(caller: CallerContext) {
  if (caller.role !== "owner" && caller.role !== "admin") {
    throw new Error(`forbidden: gate decisions require 'owner' or 'admin' role, caller has '${caller.role}'`);
  }
}

export interface PlatformOperatorContext {
  userId: string;
}

// House of Parliament spec §2: "not Organisation-scoped — its users are
// platform operators, not members of any single tenant Organisation... may
// not belong to any CSO Organisation at all." resolveCaller() above always
// requires a real projectId to resolve organisationId, which is exactly
// the wrong shape for this caller class — a platform operator with zero
// project/organisation membership must still be able to approve a prompt,
// curate institutional memory, or edit a Vote of No Confidence threshold.
// This resolves identity + the is_platform_operator flag directly, with
// no organisation/project dependency at all.
export async function resolvePlatformOperator(req: Request, admin: SupabaseClient): Promise<PlatformOperatorContext> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("unauthorized: missing Authorization header");
  const token = authHeader.replace(/^Bearer\s+/i, "");

  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await anon.auth.getUser();
  if (userErr || !userData?.user) throw new Error("unauthorized: invalid token");

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("is_platform_operator")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileErr) throw profileErr;
  if (!profile?.is_platform_operator) {
    throw new Error("forbidden: this action requires profiles.is_platform_operator = true (House of Parliament spec §2)");
  }

  // Security spec §1: MFA required for any is_platform_operator account —
  // enforced here, not just at enrolment, per readJwtAal's comment above.
  if (readJwtAal(token) !== "aal2") {
    throw new Error("forbidden: this account requires MFA (TOTP) verification for this session — re-authenticate with a second factor (Security spec §1)");
  }

  return { userId: userData.user.id };
}
