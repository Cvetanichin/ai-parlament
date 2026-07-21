// Unit tests for the deterministic routing resolver
// (PHASE1_RESCOPING.md §7, task 1.10 — "full branch coverage on the
// routing function per docs/18-Testing's deterministic-rule-coverage-first
// philosophy"). No network — a minimal stub stands in for the
// `.from().select().eq().order()` chain resolveWorkflowForRequest uses.
import { assertEquals } from "jsr:@std/assert@1";
import { resolveWorkflowForRequest } from "./promptOrchestrationRouting.ts";

interface FakeRule {
  id: string;
  rule_name: string;
  priority: number;
  match_logic_json: unknown;
  selected_workflow_definition_id: string;
  active: boolean;
}

// Deliberately loose typing (matches only what resolveWorkflowForRequest
// actually calls) — a full SupabaseClient mock would be a much larger
// surface than this one deterministic function needs.
// deno-lint-ignore no-explicit-any
function fakeSupabase(rules: FakeRule[]): any {
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_field: string, value: boolean) => ({
          order: (_field2: string, _opts: unknown) => ({
            data: rules.filter((r) => r.active === value).sort((a, b) => a.priority - b.priority),
            error: null,
          }),
        }),
      }),
    }),
  };
}

const RULES: FakeRule[] = [
  {
    id: "rule-me",
    rule_name: "Route M&E domain requests",
    priority: 100,
    match_logic_json: { match: { field: "domain", equals: "monitoring_and_evaluation" } },
    selected_workflow_definition_id: "wf-me",
    active: true,
  },
  {
    id: "rule-mvp",
    rule_name: "Route product/MVP domain requests",
    priority: 100,
    match_logic_json: { match: { field: "domain", equals: "product_and_mvp" } },
    selected_workflow_definition_id: "wf-mvp",
    active: true,
  },
  {
    id: "rule-inactive",
    rule_name: "Disabled rule that would otherwise match everything",
    priority: 1,
    match_logic_json: { match: { field: "domain", equals: "monitoring_and_evaluation" } },
    selected_workflow_definition_id: "wf-should-never-match",
    active: false,
  },
];

Deno.test("resolveWorkflowForRequest matches the rule whose field equals the classification value", async () => {
  const resolved = await resolveWorkflowForRequest(fakeSupabase(RULES), { domain: "monitoring_and_evaluation" });
  assertEquals(resolved?.workflowDefinitionId, "wf-me");
  assertEquals(resolved?.ruleId, "rule-me");
});

Deno.test("resolveWorkflowForRequest returns null when no rule matches", async () => {
  const resolved = await resolveWorkflowForRequest(fakeSupabase(RULES), { domain: "advocacy" });
  assertEquals(resolved, null);
});

Deno.test("resolveWorkflowForRequest ignores inactive rules even when their match_logic_json would fire", async () => {
  // rule-inactive has priority 1 (would run first) and matches
  // monitoring_and_evaluation, but active=false — the fake client's .eq()
  // filter already excludes it, mirroring the real
  // `.eq("active", true)` call. This proves the query itself is
  // constructed correctly, not just that the interpreter re-checks active
  // client-side.
  const resolved = await resolveWorkflowForRequest(fakeSupabase(RULES), { domain: "monitoring_and_evaluation" });
  assertEquals(resolved?.workflowDefinitionId, "wf-me");
});

Deno.test("resolveWorkflowForRequest respects priority order when multiple rules could match", async () => {
  const rules: FakeRule[] = [
    {
      id: "low-priority",
      rule_name: "Low priority catch-all",
      priority: 200,
      match_logic_json: { match: { field: "domain", equals: "general" } },
      selected_workflow_definition_id: "wf-catch-all",
      active: true,
    },
    {
      id: "high-priority",
      rule_name: "High priority specific match",
      priority: 10,
      match_logic_json: { match: { field: "domain", equals: "general" } },
      selected_workflow_definition_id: "wf-specific",
      active: true,
    },
  ];
  const resolved = await resolveWorkflowForRequest(fakeSupabase(rules), { domain: "general" });
  assertEquals(resolved?.workflowDefinitionId, "wf-specific");
});
