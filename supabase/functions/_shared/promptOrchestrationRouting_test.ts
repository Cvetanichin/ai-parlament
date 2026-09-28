import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { resolveWorkflowForRequest } from "./promptOrchestrationRouting.ts";

interface Rule {
  id: string;
  rule_name: string;
  priority: number;
  match_logic_json: { match: { field: string; equals: unknown } };
  selected_workflow_definition_id: string;
}

function fakeSupabase(rules: Rule[] | null, error: Error | null = null) {
  return {
    rpc: (name: string) => {
      assertEquals(name, "rpc_get_active_routing_rules");
      return Promise.resolve({ data: rules, error });
    },
  };
}

const rules: Rule[] = [
  {
    id: "rule-mvp",
    rule_name: "MVP",
    priority: 100,
    match_logic_json: { match: { field: "domain", equals: "product_and_mvp" } },
    selected_workflow_definition_id: "wf-mvp",
  },
  {
    id: "rule-me",
    rule_name: "M&E",
    priority: 10,
    match_logic_json: { match: { field: "domain", equals: "monitoring_and_evaluation" } },
    selected_workflow_definition_id: "wf-me",
  },
];

Deno.test("matches the rule returned by the active-rules RPC", async () => {
  // deno-lint-ignore no-explicit-any
  const resolved = await resolveWorkflowForRequest(fakeSupabase(rules) as any, {
    domain: "monitoring_and_evaluation",
  });
  assertEquals(resolved, {
    workflowDefinitionId: "wf-me",
    ruleId: "rule-me",
    ruleName: "M&E",
  });
});

Deno.test("returns null for an unsupported domain or no active rules", async () => {
  // deno-lint-ignore no-explicit-any
  assertEquals(await resolveWorkflowForRequest(fakeSupabase(rules) as any, { domain: "advocacy" }), null);
  // deno-lint-ignore no-explicit-any
  assertEquals(await resolveWorkflowForRequest(fakeSupabase([]) as any, { domain: "monitoring_and_evaluation" }), null);
  // deno-lint-ignore no-explicit-any
  assertEquals(await resolveWorkflowForRequest(fakeSupabase(null) as any, { domain: "monitoring_and_evaluation" }), null);
});

Deno.test("first matching rule in priority order wins", async () => {
  const matching = [
    { ...rules[0], id: "first", priority: 1, selected_workflow_definition_id: "wf-first" },
    { ...rules[0], id: "second", priority: 2, selected_workflow_definition_id: "wf-second" },
  ];
  // deno-lint-ignore no-explicit-any
  const resolved = await resolveWorkflowForRequest(fakeSupabase(matching) as any, { domain: "product_and_mvp" });
  assertEquals(resolved?.workflowDefinitionId, "wf-first");
});

Deno.test("propagates an RPC error", async () => {
  // deno-lint-ignore no-explicit-any
  await assertRejects(() => resolveWorkflowForRequest(fakeSupabase(null, new Error("denied")) as any, {}), Error, "denied");
});
