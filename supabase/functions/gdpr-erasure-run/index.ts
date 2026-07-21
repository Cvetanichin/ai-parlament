// POST /gdpr-erasure-run
// GDPR Right-to-Erasure (Security spec §7's 4-row rule). Two distinct
// erasure subjects, both handled here since the spec's four rows split
// across them:
//
// requestType: "user_account" — a departing platform user.
//   1. Hard delete: organisation_members rows, profiles row, then the
//      auth.users row itself (via the GoTrue admin API — this is the
//      one part of erasure no direct table DELETE can reach). Deleted in
//      that order because neither profiles.id->auth.users(id) nor
//      organisation_members.user_id->auth.users(id) declares ON DELETE
//      CASCADE (checked directly against the migrations) — deleting
//      auth.users first would just fail on a foreign-key violation.
//   2. Anonymize (never delete): every real author-tracking column found
//      in the current schema — projects.created_by, clients.created_by,
//      prompt_modules.author_id. Note: the spec's own illustrative list
//      ("proposals, prompt versions, workflow definitions") includes two
//      tables — `proposals`, `workflow_definitions` — that have no
//      author/created_by column at all in this schema (checked directly
//      against every migration); there is nothing to anonymize on them
//      today, not a gap this function silently ignores.
//   3. Anonymize audit_events.actor_id — never delete the event row
//      (§8's Auditability precedence: audit-log immutability wins via
//      anonymization, a platform-wide precedent, not a per-table call).
//
// requestType: "beneficiary_source_documents" — an erasure request about
// someone named IN a document, not a platform user. Scoped to the exact
// knowledge_documents rows the caller identifies (§7's "source documents
// only" — downstream artefacts already hold only redacted placeholder
// tokens per §4's filter, so they need no action). Hard delete. Physical
// Object Storage deletion is explicitly NOT performed here: knowledge_
// documents has no storage-path column anywhere in this schema (checked),
// so there is no real bucket/path to delete against — a known limitation,
// not a silent gap.
//
// Platform-operator only (this touches auth.users and cross-organisation
// audit rows — not an organisation-scoped action any owner/admin should
// reach for their own tenant alone).
//
// Body: { requestType: "user_account", userId } |
//       { requestType: "beneficiary_source_documents", documentIds: string[] }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolvePlatformOperator } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { requestType } = body;
    if (requestType !== "user_account" && requestType !== "beneficiary_source_documents") {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "requestType must be 'user_account' or 'beneficiary_source_documents'" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const operator = await resolvePlatformOperator(req, admin);

    if (requestType === "user_account") {
      const { userId } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: { code: "bad_request", message: "userId is required" } }), { status: 400 });
      }

      const anonymized: Record<string, number> = {};

      for (const [table, column] of [["projects", "created_by"], ["clients", "created_by"], ["prompt_modules", "author_id"]] as const) {
        const { data, error } = await admin.from(table).update({ [column]: null }).eq(column, userId).select("id");
        if (error) throw error;
        anonymized[table] = data?.length ?? 0;
      }

      const { data: anonymizedAudit, error: auditAnonErr } = await admin
        .from("audit_events")
        .update({ actor_id: null })
        .eq("actor_id", userId)
        .select("id");
      if (auditAnonErr) throw auditAnonErr;
      anonymized["audit_events"] = anonymizedAudit?.length ?? 0;

      const { error: memberDeleteErr } = await admin.from("organisation_members").delete().eq("user_id", userId);
      if (memberDeleteErr) throw memberDeleteErr;

      const { error: profileDeleteErr } = await admin.from("profiles").delete().eq("id", userId);
      if (profileDeleteErr) throw profileDeleteErr;

      const { error: authDeleteErr } = await admin.auth.admin.deleteUser(userId);
      if (authDeleteErr) throw authDeleteErr;

      // No organisation_id to attribute this to (the user is gone, and
      // this can span organisations) — same sentinel "Platform"
      // organisation ADR-0010 established for global, organisation-less
      // audit attribution.
      const { data: platformOrg } = await admin.from("organisations").select("id").eq("name", "Platform").maybeSingle();
      if (platformOrg?.id) {
        await admin.from("audit_events").insert({
          organisation_id: platformOrg.id,
          actor_type: "human",
          action: "gdpr_erasure_user_account",
          target_type: "user",
          detail: { erasedUserId: userId, operatorUserId: operator.userId, anonymized },
        });
      }

      return new Response(JSON.stringify({ requestType, userId, anonymized, deleted: ["organisation_members", "profiles", "auth.users"] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const { documentIds } = body;
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return new Response(JSON.stringify({ error: { code: "bad_request", message: "documentIds (non-empty array) is required" } }), { status: 400 });
    }

    const { data: deleted, error: deleteErr } = await admin
      .from("knowledge_documents")
      .delete()
      .in("id", documentIds)
      .select("id");
    if (deleteErr) throw deleteErr;

    const { data: platformOrg } = await admin.from("organisations").select("id").eq("name", "Platform").maybeSingle();
    if (platformOrg?.id) {
      await admin.from("audit_events").insert({
        organisation_id: platformOrg.id,
        actor_type: "human",
        action: "gdpr_erasure_beneficiary_documents",
        target_type: "knowledge_document",
        detail: { requestedDocumentIds: documentIds, deletedCount: deleted?.length ?? 0, operatorUserId: operator.userId, note: "physical Object Storage deletion not performed — no storage-path column exists on knowledge_documents in this schema" },
      });
    }

    return new Response(
      JSON.stringify({ requestType, deletedCount: deleted?.length ?? 0, deletedIds: (deleted ?? []).map((d) => d.id) }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
