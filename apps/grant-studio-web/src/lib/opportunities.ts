import { supabase } from "@/lib/supabase";

// opportunities.status CHECK constraint (see migrations) -- richer than
// grant-stream-studio's 3-value open/forthcoming/closed, this schema also
// distinguishes "rolling" (no deadline, always open) from "archived"
// (closed and no longer tracked).
export const OPPORTUNITY_STATUSES = ["open", "forthcoming", "rolling", "closed", "archived"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export interface OpportunityDonor {
  id: string;
  name: string;
  // donors.donor_status is the relationship-category enum (current_donor /
  // warm_prospect / former_donor / cold_prospect / new_funder /
  // revisit_prospect / disqualified) -- this is the concept grant-stream-
  // studio's fixture called funder.stage. donors.pipeline_stage is a
  // separate free-text DFF position field, not this.
  status: string | null;
}

export interface Opportunity {
  id: string;
  cluster: string | null;
  isNew: boolean;
  title: string;
  description: string | null;
  tags: string[];
  eligibilitySummary: string | null;
  region: string | null;
  applicationType: string | null;
  amountMin: number | null;
  amountMax: number | null;
  currency: string | null;
  deadline: string | null;
  status: OpportunityStatus;
  strategicNarrative: string | null;
  relevanceScore: number | null;
  sourceUrl: string | null;
  scrapeNote: string | null;
  donor: OpportunityDonor | null;
  linkedProposalId: string | null;
}

interface OpportunityRow {
  id: string;
  cluster: string | null;
  is_new: boolean | null;
  title: string;
  description: string | null;
  tags: string[] | null;
  eligibility_summary: string | null;
  region: string | null;
  application_type: string | null;
  amount_min: number | null;
  amount_max: number | null;
  currency: string | null;
  deadline: string | null;
  status: string | null;
  strategic_narrative: string | null;
  relevance_score: number | null;
  source_url: string | null;
  scrape_note: string | null;
  donor: { id: string; name: string; donor_status: string | null } | null;
}

// Direct Supabase client reads (docs/13-Frontend §2) -- RLS on both tables
// already scopes to the caller's organisation via organisation_members, so
// no Edge Function round-trip is needed for either query.
export async function fetchOpportunities(organisationId: string): Promise<Opportunity[]> {
  const [opportunitiesRes, proposalsRes] = await Promise.all([
    supabase
      .from("opportunities")
      .select(
        `id, cluster, is_new, title, description, tags, eligibility_summary, region,
         application_type, amount_min, amount_max, currency, deadline, status,
         strategic_narrative, relevance_score, source_url, scrape_note,
         donor:donors(id, name, donor_status)`,
      )
      .eq("organisation_id", organisationId)
      .order("deadline", { ascending: true, nullsFirst: false }),
    supabase.from("proposals").select("id, opportunity_id").eq("organisation_id", organisationId),
  ]);

  if (opportunitiesRes.error) throw opportunitiesRes.error;
  if (proposalsRes.error) throw proposalsRes.error;

  const linkedByOpportunity = new Map<string, string>();
  for (const p of proposalsRes.data ?? []) {
    if (!linkedByOpportunity.has(p.opportunity_id)) linkedByOpportunity.set(p.opportunity_id, p.id);
  }

  return ((opportunitiesRes.data ?? []) as unknown as OpportunityRow[]).map((row) => ({
    id: row.id,
    cluster: row.cluster,
    isNew: Boolean(row.is_new),
    title: row.title,
    description: row.description,
    tags: row.tags ?? [],
    eligibilitySummary: row.eligibility_summary,
    region: row.region,
    applicationType: row.application_type,
    amountMin: row.amount_min,
    amountMax: row.amount_max,
    currency: row.currency,
    deadline: row.deadline,
    status: (row.status ?? "open") as OpportunityStatus,
    strategicNarrative: row.strategic_narrative,
    relevanceScore: row.relevance_score,
    sourceUrl: row.source_url,
    scrapeNote: row.scrape_note,
    donor: row.donor ? { id: row.donor.id, name: row.donor.name, status: row.donor.donor_status } : null,
    linkedProposalId: linkedByOpportunity.get(row.id) ?? null,
  }));
}

// "Start proposal from this call" -- a direct insert, not an Edge Function
// call: creating a Proposal row is plain RLS-scoped row creation, not a
// Workflow Instance start (Parliament Core only enters the picture once a
// Human Gate or specialist run is invoked from within the proposal, per
// Phase D onward). status: "pending" is the Domain Model spec's own
// vocabulary (Domain-Model-Specification-v1.0.md §"Entity lifecycle
// states": proposal status is freeform, driven by Workflow Instance state
// -- "pending" is that state machine's own initial value, used here before
// any workflow instance has been started for this proposal).
export async function startProposalFromOpportunity(organisationId: string, opportunityId: string): Promise<string> {
  const { data, error } = await supabase
    .from("proposals")
    .insert({ organisation_id: organisationId, opportunity_id: opportunityId, stage: "concept_note", status: "pending" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export interface Proposal {
  id: string;
  organisationId: string;
  stage: "concept_note" | "full_application";
  status: string;
  opportunity: {
    id: string;
    title: string;
    description: string | null;
    eligibilitySummary: string | null;
    donorName: string | null;
  };
}

export async function fetchProposal(proposalId: string): Promise<Proposal> {
  const { data, error } = await supabase
    .from("proposals")
    .select(
      `id, organisation_id, stage, status,
       opportunity:opportunities(id, title, description, eligibility_summary, donor:donors(name))`,
    )
    .eq("id", proposalId)
    .single();
  if (error) throw error;
  const row = data as unknown as {
    id: string;
    organisation_id: string;
    stage: "concept_note" | "full_application";
    status: string;
    opportunity: { id: string; title: string; description: string | null; eligibility_summary: string | null; donor: { name: string } | null };
  };
  return {
    id: row.id,
    organisationId: row.organisation_id,
    stage: row.stage,
    status: row.status,
    opportunity: {
      id: row.opportunity.id,
      title: row.opportunity.title,
      description: row.opportunity.description,
      eligibilitySummary: row.opportunity.eligibility_summary,
      donorName: row.opportunity.donor?.name ?? null,
    },
  };
}
