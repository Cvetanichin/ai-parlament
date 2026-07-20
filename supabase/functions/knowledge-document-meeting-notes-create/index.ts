// POST /knowledge-document-meeting-notes-create
// Knowledge Hub spec §1.2 (Meeting Notes Capture): "writes a new
// knowledge_documents row on save (document_type = 'meeting_notes'),
// entering the shared ingestion/chunking pipeline like any other
// document." §4 NFR: "a meeting note mentioning a beneficiary by name is
// redacted before embedding, same as any other source document."
//
// Applies the PII filter to `content` at write time, before the row is
// ever created — not just at the later embedding step. embedding-
// pipeline-run's filter (Security spec §4.2 point 1) only ever redacted
// the text fed to the embedding model, never wrote the redaction back to
// the source row's own content column, so a raw, unredacted meeting note
// would otherwise sit in knowledge_documents.content indefinitely and be
// readable by Document Browser (§1.1) regardless of what the embedding
// itself was based on. Redacting here, at the one point this document
// type is actually authored, closes that gap for meeting notes
// specifically; other Knowledge Platform ingestion paths (file uploads
// etc.) still only redact at embedding time and are a known follow-up,
// not fixed by this change.
//
// Body: { projectId, title, content, relatedEntityType?, relatedEntityId? }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { redactBeneficiaryPII } from "../_shared/piiFilter.ts";

const RELATED_ENTITY_TYPES = ["donor", "proposal", "project"];

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, title, content, relatedEntityType, relatedEntityId } = body;
    if (!projectId || !title || !content) {
      return new Response(JSON.stringify({ error: { code: "bad_request", message: "projectId, title, content are required" } }), { status: 400 });
    }
    if (relatedEntityType && !RELATED_ENTITY_TYPES.includes(relatedEntityType)) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: `relatedEntityType must be one of: ${RELATED_ENTITY_TYPES.join(", ")}` } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);

    const { redactedText, redactions } = redactBeneficiaryPII(content);

    const { data: doc, error: insertErr } = await admin
      .from("knowledge_documents")
      .insert({
        organisation_id: caller.organisationId,
        title,
        content: redactedText,
        document_type: "meeting_notes",
        source_type: "manual_upload",
        related_entity_type: relatedEntityType ?? null,
        related_entity_id: relatedEntityId ?? null,
      })
      .select("id")
      .single();
    if (insertErr) throw insertErr;

    if (redactions.length > 0) {
      await admin.from("audit_events").insert({
        organisation_id: caller.organisationId,
        actor_type: "system",
        action: "pii_redacted",
        target_type: "knowledge_document",
        target_id: doc.id,
        detail: { filterStage: "meeting_notes_capture", redactions },
      });
    }

    return new Response(JSON.stringify({ knowledgeDocumentId: doc.id, redactions }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
