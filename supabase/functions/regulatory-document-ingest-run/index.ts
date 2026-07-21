// POST /regulatory-document-ingest-run
// Regulatory Knowledge Layer ingestion pipeline entry point (spec §4).
// `regulatory_documents`/`regulatory_clauses` carry no organisation_id —
// they are global, platform-wide content (every organisation's Eligibility/
// Compliance/Budget Validators read the same clause set), so this is gated
// as a platform-operator action (House of Parliament spec §2's pattern —
// resolvePlatformOperator, MFA-required), not an organisation-scoped
// resolveCaller call. This is a deliberate scoping choice: ingesting a
// PRAG/Annex document is a platform-content-curation act, not something
// any one tenant organisation does for itself.
//
// Every row this writes is a verbatim excerpt of the caller-supplied
// `rawText`, classified by a deterministic keyword heuristic
// (regulatoryIngestion.ts) — never LLM-generated, never review_status
// anything but 'needs_human_review'. This is what makes it safe to run
// without violating Grant Studio §3's "never freeform text asserting a
// rule exists": nothing here asserts a rule is real until a human reviews
// and confirms it (a separate, not-yet-built review workflow — this
// function only ingests and classifies, it does not confirm).
//
// Body: { title, category, version, effectiveDate?, jurisdiction?,
//   sourceUrl?, rawText, maxChunkChars? }
// category must be one of the real regulatory_documents.category CHECK
// values: eu_prag | eu_contract | eu_guidelines | eu_application |
// organisation_policy | national_law | internal_learned | ai_governance.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolvePlatformOperator } from "../_shared/auth.ts";
import { parseRegulatoryDocument, chunkClauses, extractRuleCandidate } from "../_shared/regulatoryIngestion.ts";

const VALID_CATEGORIES = [
  "eu_prag",
  "eu_contract",
  "eu_guidelines",
  "eu_application",
  "organisation_policy",
  "national_law",
  "internal_learned",
  "ai_governance",
];

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { title, category, version, effectiveDate, jurisdiction, sourceUrl, rawText, maxChunkChars } = body;
    if (!title || !category || !version || !rawText) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "title, category, version, rawText are required" } }),
        { status: 400 },
      );
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: `category must be one of: ${VALID_CATEGORIES.join(", ")}` } }),
        { status: 400 },
      );
    }
    if (typeof rawText !== "string" || rawText.trim().length < 20) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "rawText must be real source document text (at least 20 characters) — this endpoint never fabricates regulatory content" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const operator = await resolvePlatformOperator(req, admin);

    const { data: documentRow, error: docErr } = await admin
      .from("regulatory_documents")
      .insert({
        title,
        category,
        version,
        effective_date: effectiveDate ?? null,
        jurisdiction: jurisdiction ?? null,
        source_url: sourceUrl ?? null,
      })
      .select("id")
      .single();
    if (docErr) throw docErr;

    const sections = parseRegulatoryDocument(rawText);
    const clauses = chunkClauses(sections, maxChunkChars ?? 1200);

    const clauseRows = clauses.map(({ section, text }) => {
      const { obligationType, extractionConfidence } = extractRuleCandidate(text);
      return {
        document_id: documentRow.id,
        document_version: version,
        section,
        text,
        obligation_type: obligationType,
        extraction_confidence: extractionConfidence,
        review_status: "needs_human_review",
      };
    });

    const { data: insertedClauses, error: clauseErr } = await admin
      .from("regulatory_clauses")
      .insert(clauseRows)
      .select("id, obligation_type, extraction_confidence");
    if (clauseErr) throw clauseErr;

    // regulatory_documents/regulatory_clauses have no organisation_id — no
    // real organisation to attribute this audit event to. Uses the same
    // sentinel-attribution pattern ADR-0010 established for embedding-
    // pipeline-run's global, organisation-less table writes: read the
    // sentinel "Platform" organisation rather than inventing a nullable
    // organisation_id on audit_events (a real, live, append-only table).
    const { data: platformOrg } = await admin.from("organisations").select("id").eq("name", "Platform").maybeSingle();
    if (platformOrg?.id) {
      await admin.from("audit_events").insert({
        organisation_id: platformOrg.id,
        actor_type: "human",
        action: "regulatory_document_ingested",
        target_type: "regulatory_document",
        target_id: documentRow.id,
        detail: {
          actorUserId: operator.userId,
          title,
          category,
          version,
          clauseCount: insertedClauses.length,
          needsHumanReview: insertedClauses.length,
        },
      });
    }

    return new Response(
      JSON.stringify({
        documentId: documentRow.id,
        clausesIngested: insertedClauses.length,
        clauses: insertedClauses,
        note: "All ingested clauses are review_status='needs_human_review' — obligation_type/extraction_confidence are a deterministic keyword heuristic, not a confirmed legal classification.",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
