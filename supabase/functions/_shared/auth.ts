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

// Security spec §2.2: Human Gate decisions require owner/admin.
export function requireGateRole(caller: CallerContext) {
  if (caller.role !== "owner" && caller.role !== "admin") {
    throw new Error(`forbidden: gate decisions require 'owner' or 'admin' role, caller has '${caller.role}'`);
  }
}
