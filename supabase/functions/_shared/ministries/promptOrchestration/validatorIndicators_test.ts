// Unit tests for validator_indicators' pure, deterministic tiers
// (docs/18-Testing's deterministic-rule-coverage-first philosophy —
// PHASE1_RESCOPING.md §7, task 1.10). No network, no Supabase client —
// these three functions take plain strings and return VetoCheckResult.
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { deterministicCheck, lexicalCheck, mockSemanticRun, parseSemanticVerdict } from "./validatorIndicators.ts";

Deno.test("deterministicCheck fails on an empty draft", () => {
  const result = deterministicCheck("", { minLength: 40 });
  assertEquals(result.pass, false);
  assertStringIncludes(result.failures[0], "empty");
});

Deno.test("deterministicCheck fails below the configured minimum length", () => {
  const result = deterministicCheck("too short", { minLength: 40 });
  assertEquals(result.pass, false);
  assertStringIncludes(result.failures[0], "below the 40-character minimum");
});

Deno.test("deterministicCheck passes a draft meeting the minimum length", () => {
  const draft = "x".repeat(50);
  const result = deterministicCheck(draft, { minLength: 40 });
  assertEquals(result, { pass: true, failures: [] });
});

Deno.test("lexicalCheck fails when no expected M&E term is present", () => {
  const result = lexicalCheck("This is an unrelated response about something else entirely.");
  assertEquals(result.pass, false);
  assertStringIncludes(result.failures[0], "off-topic");
});

Deno.test("lexicalCheck passes when at least one expected term is present", () => {
  const result = lexicalCheck("The proposed indicator lacks a clear baseline.");
  assertEquals(result, { pass: true, failures: [] });
});

Deno.test("lexicalCheck is case-insensitive", () => {
  const result = lexicalCheck("MEANS OF VERIFICATION is missing for this row.");
  assertEquals(result.pass, true);
});

Deno.test("parseSemanticVerdict passes on 'strong'", () => {
  const result = parseSemanticVerdict("Indicator issues:\n- none\n\nAssessment:\n- strong");
  assertEquals(result, { pass: true, failures: [] });
});

Deno.test("parseSemanticVerdict passes on 'usable with revisions'", () => {
  const result = parseSemanticVerdict("Assessment:\n- usable with revisions");
  assertEquals(result.pass, true);
});

Deno.test("parseSemanticVerdict fails on 'weak' and includes the full review in the failure", () => {
  const raw = "Indicator issues:\n- vague\n\nAssessment:\n- weak";
  const result = parseSemanticVerdict(raw);
  assertEquals(result.pass, false);
  assertStringIncludes(result.failures[0], "weak");
  assertStringIncludes(result.failures[0], raw);
});

Deno.test("parseSemanticVerdict fails safe when no Assessment line is found", () => {
  const result = parseSemanticVerdict("The model rambled without following the required structure.");
  assertEquals(result.pass, false);
  assertStringIncludes(result.failures[0], "could not find a parseable Assessment line");
});

Deno.test("mockSemanticRun flags a thin draft as weak", () => {
  const raw = mockSemanticRun({ draft: "too short" });
  const verdict = parseSemanticVerdict(raw);
  assertEquals(verdict.pass, false);
});

Deno.test("mockSemanticRun approves a substantial draft as strong", () => {
  const raw = mockSemanticRun({ draft: "x".repeat(100) });
  const verdict = parseSemanticVerdict(raw);
  assertEquals(verdict.pass, true);
});
