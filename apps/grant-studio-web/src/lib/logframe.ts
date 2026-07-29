import { supabase } from "@/lib/supabase";

// Grant Studio spec §6.1: logframe_narratives holds only the prose that has
// no other home (Theory of Change, assumptions) plus the objective/result
// tree, deliberately kept jsonb since it's a tree, not a flat record set.
// Indicators are real rows in the pre-existing `indicators` table
// (project_id-scoped originally; extended with proposal_id per the same
// "graduates into a real row" pattern proposals -> projects already use).
export interface InterventionActivity {
  id: string;
  description: string;
}

export interface InterventionResult {
  id: string;
  description: string;
  activities: InterventionActivity[];
}

export interface InterventionObjective {
  id: string;
  description: string;
  results: InterventionResult[];
}

export interface LogframeNarrative {
  id: string;
  theoryOfChange: string;
  assumptions: string;
  interventionLogic: InterventionObjective[];
}

interface LogframeNarrativeRow {
  id: string;
  theory_of_change: string | null;
  assumptions: string | null;
  intervention_logic: InterventionObjective[] | null;
}

export async function fetchLogframeNarrative(proposalId: string): Promise<LogframeNarrative | null> {
  const { data, error } = await supabase
    .from("logframe_narratives")
    .select("id, theory_of_change, assumptions, intervention_logic")
    .eq("proposal_id", proposalId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as LogframeNarrativeRow;
  return {
    id: row.id,
    theoryOfChange: row.theory_of_change ?? "",
    assumptions: row.assumptions ?? "",
    interventionLogic: row.intervention_logic ?? [],
  };
}

// No unique constraint on proposal_id, so select-then-write, matching
// saveProposalSection's/ensureProjectForOpportunity's same pattern.
export async function saveLogframeNarrative(
  organisationId: string,
  proposalId: string,
  narrative: Pick<LogframeNarrative, "theoryOfChange" | "assumptions" | "interventionLogic">,
): Promise<void> {
  const existing = await fetchLogframeNarrative(proposalId);
  const payload = {
    theory_of_change: narrative.theoryOfChange,
    assumptions: narrative.assumptions,
    intervention_logic: narrative.interventionLogic,
  };
  if (existing) {
    const { error } = await supabase.from("logframe_narratives").update(payload).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("logframe_narratives")
      .insert({ organisation_id: organisationId, proposal_id: proposalId, ...payload });
    if (error) throw error;
  }
}

export interface Indicator {
  id: string;
  name: string;
  level: string | null;
  unit: string | null;
  baseline: number | null;
  target: number | null;
  dataSource: string | null;
  collectionMethod: string | null;
  frequency: string | null;
  responsible: string | null;
}

interface IndicatorRow {
  id: string;
  name: string;
  level: string | null;
  unit: string | null;
  baseline: number | null;
  target: number | null;
  data_source: string | null;
  collection_method: string | null;
  frequency: string | null;
  responsible: string | null;
}

const INDICATOR_COLUMNS =
  "id, name, level, unit, baseline, target, data_source, collection_method, frequency, responsible";

function fromIndicatorRow(row: IndicatorRow): Indicator {
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    unit: row.unit,
    baseline: row.baseline,
    target: row.target,
    dataSource: row.data_source,
    collectionMethod: row.collection_method,
    frequency: row.frequency,
    responsible: row.responsible,
  };
}

export async function fetchIndicators(proposalId: string): Promise<Indicator[]> {
  const { data, error } = await supabase
    .from("indicators")
    .select(INDICATOR_COLUMNS)
    .eq("proposal_id", proposalId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as IndicatorRow[]).map(fromIndicatorRow);
}

export type IndicatorInput = Omit<Indicator, "id">;

export async function createIndicator(
  organisationId: string,
  proposalId: string,
  input: IndicatorInput,
): Promise<Indicator> {
  const { data, error } = await supabase
    .from("indicators")
    .insert({
      organisation_id: organisationId,
      proposal_id: proposalId,
      name: input.name,
      level: input.level,
      unit: input.unit,
      baseline: input.baseline,
      target: input.target,
      data_source: input.dataSource,
      collection_method: input.collectionMethod,
      frequency: input.frequency,
      responsible: input.responsible,
    })
    .select(INDICATOR_COLUMNS)
    .single();
  if (error) throw error;
  return fromIndicatorRow(data as IndicatorRow);
}

export async function updateIndicator(indicatorId: string, input: IndicatorInput): Promise<void> {
  const { error } = await supabase
    .from("indicators")
    .update({
      name: input.name,
      level: input.level,
      unit: input.unit,
      baseline: input.baseline,
      target: input.target,
      data_source: input.dataSource,
      collection_method: input.collectionMethod,
      frequency: input.frequency,
      responsible: input.responsible,
    })
    .eq("id", indicatorId);
  if (error) throw error;
}

export async function deleteIndicator(indicatorId: string): Promise<void> {
  const { error } = await supabase.from("indicators").delete().eq("id", indicatorId);
  if (error) throw error;
}

// "Suggest indicators" (Grant Studio spec §6.1): calls the real, deployed
// prompt-orchestration-run pipeline (specialist_me_framework, via the
// monitoring_and_evaluation domain) and returns its formatted-table text
// for a human to read and manually transcribe into real indicator rows --
// deliberately not parsed and auto-inserted. Requires a real `projects`
// row anchor (ADR-0013's pre-award pattern), same as the Go/No-Go gate.
//
// Known limitation, confirmed live (2026-07-29): this chain is intake_
// normalizer -> intent_classifier -> specialist_me_framework -> validator_
// indicators (deterministic + lexical + semantic, up to 2 VoNC retries) ->
// formatter_table_first -- up to 6-7 sequential real Anthropic calls in one
// synchronous request. Confirmed hitting Supabase's free-tier Edge Function
// wall-clock limit twice in a row (HTTP 546, execution_time_ms exactly
// ~150100 both times -- the platform's hard 150s cap, not a fluke). Same
// documented risk as Session 6's max_tokens finding (docs/README.md): the
// real fix is background/async execution for multi-call workflows, already
// flagged there as necessary Phase 2+ architecture work, not something to
// patch here. Left as-is deliberately -- the error surfaces correctly to
// the user rather than hanging or lying about success, and manual indicator
// entry (the CRUD above) is unaffected.
export async function suggestIndicators(projectId: string, userInput: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ finalOutput?: string; error?: { message: string } }>(
    "prompt-orchestration-run",
    { body: { projectId, userInput } },
  );
  if (error) throw error;
  if (!data?.finalOutput) throw new Error(data?.error?.message ?? "No suggestion returned");
  return data.finalOutput;
}
