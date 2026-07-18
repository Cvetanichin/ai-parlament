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

// JWT payload role sniff — the service_role key is a JWT whose payload has
// role: 'service_role'; resolving it via auth.getUser() returns no user
// (it's a role, not a user), so this must be checked first.
function readJwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1] + "==".slice((2 - (parts[1].length * 3) % 4) % 4);
    const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
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
