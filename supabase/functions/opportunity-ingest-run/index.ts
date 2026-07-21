// POST /opportunity-ingest-run
// Opportunity Intelligence ingestion (Grant Studio §2, ADR-0002). Per spec
// and ADR-0002, the "AI Grants Scraper" is a separate artifact whose
// structured output (funding-dashboard-v5.html's live schema) gets ingested
// here — this is deliberately NOT a live web crawler. Spec §2.3 assigns
// crawl scheduling/the source registry to shared Layer-3 infrastructure not
// specified in this repo; what Grant Studio itself needs is an endpoint
// that accepts that structured output and upserts it into `opportunities`.
//
// Upserts on (organisation_id, external_id) — no unique DB constraint
// exists for this pair (checked: only non-unique indexes on donor_id/
// organisation_id in 10_performance_hardening.sql), so this does a
// select-then-insert/update, matching this codebase's existing idempotent-
// registration pattern (agentRuntime.ts's ensureAgent/ensureActivePromptVersion).
//
// For each ingested record, drafts a strategic_narrative/risk_score/
// relevance_score via the Fundraising Ministry — explicitly advisory
// (Grant Studio §2.2), never itself gating anything.
//
// projectId is required for agent_runs' NOT NULL constraint even though
// Opportunity Intelligence logically runs pre-project — the same known
// Phase 1 simplification already flagged in proposal-create/index.ts and
// workflow-research-run/index.ts (workflow_instances/agent_runs target a
// project directly; a first-class Opportunity→Project linkage independent
// of an existing project isn't built yet). Not a new gap, just the same one
// applied consistently here.
//
// Body: { projectId, records: OpportunityRecord[] }
// OpportunityRecord: { externalId?, title, description?, donorId?, cluster?,
//   tags?, tagConfidence?, eligibilitySummary?, region?, fundingType?,
//   applicationType?, amountMin?, amountMax?, currency?, deadline?, status?,
//   sourceUrl?, scrapeNote? }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { invokeAgent } from "../_shared/agentRuntime.ts";
import { buildPrompt, mockRun, parseResponse, FundraisingInput } from "../_shared/ministries/fundraising.ts";

interface OpportunityRecord {
  externalId?: string;
  title: string;
  description?: string;
  donorId?: string;
  cluster?: string;
  tags?: string[];
  tagConfidence?: Record<string, number>;
  eligibilitySummary?: string;
  region?: string;
  fundingType?: string;
  applicationType?: string;
  amountMin?: number;
  amountMax?: number;
  currency?: string;
  deadline?: string;
  status?: string;
  sourceUrl?: string;
  scrapeNote?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, records } = body as { projectId: string; records: OpportunityRecord[] };
    if (!projectId || !Array.isArray(records) || records.length === 0) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "projectId and a non-empty records[] are required" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);
    if (!["owner", "admin", "system"].includes(caller.role)) {
      return new Response(
        JSON.stringify({ error: { code: "forbidden", message: "opportunity ingestion requires 'owner' or 'admin' role" } }),
        { status: 403 },
      );
    }

    const results: Array<{ externalId: string | null; opportunityId: string; wasUpdate: boolean; strategicNarrative: string; riskScore: number; relevanceScore: number; flags: string[] }> = [];

    for (const record of records) {
      let existingId: string | null = null;
      let existingVersion = 0;
      if (record.externalId) {
        const { data: existing } = await admin
          .from("opportunities")
          .select("id, version")
          .eq("organisation_id", caller.organisationId)
          .eq("external_id", record.externalId)
          .maybeSingle();
        existingId = existing?.id ?? null;
        existingVersion = existing?.version ?? 0;
      }

      const draft = await invokeAgent({
        supabase: admin,
        agentSlug: "fundraising_ministry",
        projectId,
        organisationId: caller.organisationId,
        input: {
          opportunity: {
            title: record.title,
            description: record.description ?? null,
            region: record.region ?? null,
            fundingType: record.fundingType ?? null,
            amountMin: record.amountMin ?? null,
            amountMax: record.amountMax ?? null,
            deadline: record.deadline ?? null,
            eligibilitySummary: record.eligibilitySummary ?? null,
            tags: record.tags ?? [],
          },
        } as unknown as Record<string, unknown>,
        // Context Engine only has a real target to scope to on an update
        // (existingId) — a brand-new opportunity has no id yet at this
        // point in the flow, so it gets institutional/org-tier context
        // only (contextEngine.ts's own filter degrades gracefully to that
        // when nothing scope_id-matches).
        contextEngine: { targetType: "opportunity", targetId: existingId ?? projectId },
        buildPrompt: (i) => buildPrompt(i as unknown as FundraisingInput),
        mockRun: (i) => mockRun(i as unknown as FundraisingInput),
        parseResponse: (raw) => parseResponse(raw),
      });
      const fundraisingResult = draft.output as { strategicNarrative: string; riskScore: number; relevanceScore: number; flags: string[] };

      const row = {
        organisation_id: caller.organisationId,
        donor_id: record.donorId ?? null,
        external_id: record.externalId ?? null,
        cluster: record.cluster ?? null,
        title: record.title,
        description: record.description ?? null,
        tags: record.tags ?? [],
        tag_confidence: record.tagConfidence ?? null,
        eligibility_summary: record.eligibilitySummary ?? null,
        region: record.region ?? null,
        funding_type: record.fundingType ?? null,
        application_type: record.applicationType ?? null,
        amount_min: record.amountMin ?? null,
        amount_max: record.amountMax ?? null,
        currency: record.currency ?? null,
        deadline: record.deadline ?? null,
        status: record.status ?? "open",
        strategic_narrative: fundraisingResult.strategicNarrative,
        risk_score: fundraisingResult.riskScore,
        relevance_score: fundraisingResult.relevanceScore,
        source_url: record.sourceUrl ?? null,
        scrape_note: record.scrapeNote ?? null,
        flags: fundraisingResult.flags,
      };

      let opportunityId: string;
      let wasUpdate = false;
      if (existingId) {
        const { data: updated, error: updateErr } = await admin
          .from("opportunities")
          .update({ ...row, version: existingVersion + 1, is_new: false })
          .eq("id", existingId)
          .select("id")
          .single();
        if (updateErr) throw updateErr;
        opportunityId = updated.id;
        wasUpdate = true;
      } else {
        const { data: created, error: insertErr } = await admin
          .from("opportunities")
          .insert({ ...row, is_new: true })
          .select("id")
          .single();
        if (insertErr) throw insertErr;
        opportunityId = created.id;
      }

      // actor_id is a uuid column; the service_role fast path (auth.ts)
      // resolves userId to the literal string "system", not a real user
      // row, so it must never be written here directly — omit it rather
      // than pass a non-UUID value (silently fails the insert otherwise,
      // since this call isn't error-checked, matching the existing
      // audit_events.insert pattern elsewhere in this codebase).
      const { error: auditErr } = await admin.from("audit_events").insert({
        organisation_id: caller.organisationId,
        actor_type: "system",
        actor_id: caller.role === "system" ? null : caller.userId,
        action: "opportunity_ingested",
        target_type: "opportunity",
        target_id: opportunityId,
        agent_run_id: draft.agentRunId,
        detail: { externalId: record.externalId ?? null, wasUpdate, flags: fundraisingResult.flags },
      });
      if (auditErr) throw auditErr;

      results.push({
        externalId: record.externalId ?? null,
        opportunityId,
        wasUpdate,
        strategicNarrative: fundraisingResult.strategicNarrative,
        riskScore: fundraisingResult.riskScore,
        relevanceScore: fundraisingResult.relevanceScore,
        flags: fundraisingResult.flags,
      });
    }

    return new Response(JSON.stringify({ ingested: results.length, results }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
