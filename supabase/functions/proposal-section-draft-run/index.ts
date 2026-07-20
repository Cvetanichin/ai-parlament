// POST /proposal-section-draft-run
// Drafts (or redrafts) one donor section of a Proposal (Grant Studio spec
// §5, Module 4): "each donor section is its own drafting workflow (a
// Workflow Instance)... a section-level failure triggers a section-level
// rewrite, not a full-document regeneration." Reuses the existing Writing
// Ministry / Vote of No Confidence loop (runGovernanceLoop,
// workflow-governance-run's engine) unchanged — this function's job is
// wiring that generic, target-agnostic loop to a real proposal_sections
// row, which the Phase 1 slice didn't do yet.
//
// Scoping simplification, flagged rather than silently done: §5.1 calls
// for "One Workflow Definition per donor section type... authored through
// House of Parliament's Workflow Builder (docs/10-)". House of Parliament
// is Phase 4, unbuilt. This reuses the single seeded "Governance Loop v1"
// Workflow Definition (11_phase1_seed.sql) for every section type instead
// — same state machine shape, no per-section-type authoring tool to author
// it through yet. Revisit once docs/10- ships.
//
// Body: { projectId, proposalId, sectionKey, brief, constraints, voteOfNoConfidenceThreshold? }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { startInstance, runGovernanceLoop } from "../_shared/workflowEngine.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "method_not_allowed", message: "POST only" } }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { projectId, proposalId, sectionKey, brief, constraints, voteOfNoConfidenceThreshold } = body;
    if (!projectId || !proposalId || !sectionKey || !brief || !constraints) {
      return new Response(
        JSON.stringify({ error: { code: "bad_request", message: "projectId, proposalId, sectionKey, brief, constraints are required" } }),
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const caller = await resolveCaller(req, admin, projectId);

    const { data: proposal, error: propErr } = await admin
      .from("proposals")
      .select("id, organisation_id")
      .eq("id", proposalId)
      .single();
    if (propErr || !proposal) {
      return new Response(JSON.stringify({ error: { code: "not_found", message: "proposal not found" } }), { status: 404 });
    }
    if (proposal.organisation_id !== caller.organisationId) {
      return new Response(JSON.stringify({ error: { code: "forbidden", message: "proposal belongs to a different organisation" } }), { status: 403 });
    }

    let { data: section } = await admin
      .from("proposal_sections")
      .select("id, workflow_instance_id")
      .eq("proposal_id", proposalId)
      .eq("section_key", sectionKey)
      .maybeSingle();

    if (!section) {
      const { data: created, error: createErr } = await admin
        .from("proposal_sections")
        .insert({ organisation_id: caller.organisationId, proposal_id: proposalId, section_key: sectionKey })
        .select("id, workflow_instance_id")
        .single();
      if (createErr) throw createErr;
      section = created;
    }

    const { data: definition, error: defErr } = await admin
      .from("workflow_definitions")
      .select("id, vote_of_no_confidence_threshold")
      .eq("name", "Governance Loop")
      .eq("version", 1)
      .single();
    if (defErr || !definition) {
      throw new Error("not_found: 'Governance Loop v1' Workflow Definition is not seeded — see 11_phase1_seed.sql");
    }

    let workflowInstanceId = section.workflow_instance_id as string | null;
    if (!workflowInstanceId) {
      workflowInstanceId = await startInstance({
        supabase: admin,
        organisationId: caller.organisationId,
        workflowDefinitionId: definition.id,
        targetType: "proposal_section",
        targetId: section.id,
      });

      await admin.from("proposal_sections").update({ workflow_instance_id: workflowInstanceId }).eq("id", section.id);
    } else {
      // Re-running an existing instance: guard against calling the loop a
      // second time once it's reached a gate or terminal state, matching
      // workflow-governance-run's own precondition. No redraft-after-
      // Polish-rejection cycle exists yet in this slice (workflowEngine.ts's
      // own wasEscalated comment) — a second unconditional loop run would
      // silently corrupt that single-pass assumption, not add a real
      // redraft feature.
      const { data: instance } = await admin
        .from("workflow_instances")
        .select("state")
        .eq("id", workflowInstanceId)
        .single();
      if (instance && (instance.state === "awaiting_human" || instance.state === "completed" || instance.state === "failed")) {
        return new Response(
          JSON.stringify({
            error: {
              code: "gate_precondition_unmet",
              message: `section's workflow instance is in state '${instance.state}' — this slice supports one drafting pass per section, no redraft-after-gate cycle exists yet`,
            },
          }),
          { status: 409 },
        );
      }
    }

    const threshold = voteOfNoConfidenceThreshold ?? definition.vote_of_no_confidence_threshold ?? 2;

    const result = await runGovernanceLoop({
      supabase: admin,
      instanceId: workflowInstanceId,
      organisationId: caller.organisationId,
      projectId,
      brief,
      constraints,
      voteOfNoConfidenceThreshold: threshold,
    });

    await admin.from("proposal_sections").update({ content: result.draft }).eq("id", section.id);

    return new Response(
      JSON.stringify({
        proposalId,
        sectionKey,
        sectionId: section.id,
        workflowInstanceId,
        draft: result.draft,
        vetoPassed: result.vetoResult?.pass ?? false,
        attempts: result.attempts,
        confidence: result.confidence,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    const message = (err as Error).message;
    const status = message.startsWith("unauthorized") ? 401 : message.startsWith("forbidden") ? 403 : message.startsWith("not_found") ? 404 : 500;
    return new Response(JSON.stringify({ error: { code: "error", message } }), { status });
  }
});
