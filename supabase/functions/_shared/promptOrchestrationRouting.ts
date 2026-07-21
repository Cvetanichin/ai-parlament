// Deterministic routing — PHASE1_RESCOPING.md §5.2. Matches
// intent_classifier's structured output against routing_rules
// (priority-ordered, lower runs first), returning the workflow_definition
// this request should be routed to. Replaces WORKFLOW_ROUTER's separate,
// non-authoritative LLM call entirely — this is the whole routing
// decision, not a check on top of one. 100% branch-coverable
// (docs/18-Testing's "deterministic-rule-coverage-first" philosophy) since
// there is no model call and no ambiguity in this function.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

interface FieldEqualsMatch {
  match: { field: string; equals: unknown };
}

export interface ResolvedWorkflow {
  workflowDefinitionId: string;
  ruleId: string;
  ruleName: string;
}

// match_logic_json shape, per migration 18_prompt_orchestration_seed.sql:
// {"match": {"field": "domain", "equals": "monitoring_and_evaluation"}} —
// a single equality check against one field of the classification object.
// Extend this function (not the caller) if a future routing_rules row
// needs a richer match shape (multiple fields, "in" instead of "equals")
// — the shape lives in the database as data, the interpreter lives here
// as the one place that understands it.
function evaluateMatch(matchLogic: FieldEqualsMatch, classification: Record<string, unknown>): boolean {
  const { field, equals } = matchLogic.match;
  return classification[field] === equals;
}

export async function resolveWorkflowForRequest(
  supabase: SupabaseClient,
  classification: Record<string, unknown>,
): Promise<ResolvedWorkflow | null> {
  const { data: rules, error } = await supabase
    .from("routing_rules")
    .select("id, rule_name, priority, match_logic_json, selected_workflow_definition_id")
    .eq("active", true)
    .order("priority", { ascending: true });
  if (error) throw error;

  for (const rule of rules ?? []) {
    if (evaluateMatch(rule.match_logic_json as FieldEqualsMatch, classification)) {
      return {
        workflowDefinitionId: rule.selected_workflow_definition_id,
        ruleId: rule.id,
        ruleName: rule.rule_name,
      };
    }
  }
  return null;
}
