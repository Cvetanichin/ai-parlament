// POST /signup-provision-run
// Local-dev/first-run bootstrap: after a real supabase.auth.signUp() call
// succeeds (client-side, anon key — normal Supabase Auth, no service-role
// needed for that part), this provisions the one thing the client CANNOT do
// itself — organisations/organisation_members have no authenticated INSERT
// policy at all (by design, Database Schema spec §1: membership is
// provisioned, not self-service row-inserted). Product Vision §2's "one
// Organisation for the whole consultancy at v1" framing means this is a
// join-the-single-org bootstrap, not a per-signup new-tenant flow: the
// first caller ever creates "Default Organisation" and becomes its owner;
// every caller after that joins the same one as a member. Idempotent — a
// user who already has a membership just gets it back.
//
// Also ensures a `projects` row exists for that organisation, since every
// gated Edge Function's resolveCaller() requires a real project to resolve
// organisationId from (the same pre-award-entity limitation flagged
// throughout this build) — without this, a fresh signup could authenticate
// but never successfully call anything gated.
//
// Body: {} (identity comes from the caller's own session JWT)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("unauthorized: missing Authorization header");

    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await anon.auth.getUser();
    if (userErr || !userData?.user) throw new Error("unauthorized: invalid token");
    const userId = userData.user.id;

    const admin = supabaseAdmin();

    const { data: existingMembership } = await admin
      .from("organisation_members")
      .select("organisation_id, role")
      .eq("user_id", userId)
      .maybeSingle();

    let organisationId: string;
    let role: string;

    if (existingMembership) {
      organisationId = existingMembership.organisation_id;
      role = existingMembership.role;
    } else {
      const { data: anyOrg } = await admin.from("organisations").select("id").limit(1).maybeSingle();

      if (anyOrg) {
        organisationId = anyOrg.id;
        role = "member";
      } else {
        const { data: newOrg, error: orgErr } = await admin.from("organisations").insert({ name: "Default Organisation" }).select("id").single();
        if (orgErr) throw orgErr;
        organisationId = newOrg.id;
        role = "owner";
      }

      const { error: memberErr } = await admin.from("organisation_members").insert({ organisation_id: organisationId, user_id: userId, role });
      if (memberErr) throw memberErr;
    }

    let { data: project } = await admin.from("projects").select("id").eq("organisation_id", organisationId).limit(1).maybeSingle();
    if (!project) {
      const { data: newProject, error: projectErr } = await admin
        .from("projects")
        .insert({ organisation_id: organisationId, name: "Sample Project", created_by: userId })
        .select("id")
        .single();
      if (projectErr) throw projectErr;
      project = newProject;
    }

    return new Response(
      JSON.stringify({ organisationId, role, projectId: project.id }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
