// LLM Gateway — Layer 4 (EAS §3.4). The only caller of a model SDK; every
// Agent invocation goes through here, never a direct provider call from
// ministry code (EAS §2 principle 5, vendor neutrality).
//
// Multi-provider, per Parliament Core §3.8 point 3: the real MVP's
// geminiClient.js becomes one provider adapter, not the whole gateway.
// Default provider is Anthropic (matches prompt_modules.model_provider's
// default, Database Schema §3 — the real, live edge functions already run
// on Claude). Gemini is kept as a second adapter for parity with the MVP.
//
// With no matching API key configured, every call falls back to the
// caller-supplied mock() function — same design intent as the real
// geminiClient.js: the whole governance loop must be demoable and testable
// with zero external dependencies or cost.

export interface ModelBinding {
  provider: "anthropic" | "gemini" | "mock";
  model: string;
}

export interface GenerateOptions {
  binding: ModelBinding;
  mock: () => string;
}

export interface GenerateResult {
  text: string;
  tokenCost: number | null; // null when mocked — no real cost incurred
  latencyMs: number;
  usedProvider: "anthropic" | "gemini" | "mock";
}

// Structured-output variant — ADR-0012 (docs/21-ADRs, repo root). Uses
// Anthropic's tool-use mechanism (a single forced tool call) to get
// schema-conformant JSON directly from `tool_use.input`, functionally
// equivalent to OpenAI's strict Structured Outputs but on the provider
// this deployment already runs every agent on. Not a replacement for
// generateText — plain-text agents keep calling that unchanged; this is
// only for prompt_modules rows with strict_output_enabled = true.
export interface GenerateStructuredOptions {
  binding: ModelBinding;
  schemaName: string;
  schema: Record<string, unknown>;
  mock: () => Record<string, unknown>;
}

export interface GenerateStructuredResult {
  output: Record<string, unknown>;
  tokenCost: number | null;
  latencyMs: number;
  usedProvider: "anthropic" | "gemini" | "mock";
}

export async function generateStructured(
  prompt: string,
  options: GenerateStructuredOptions,
): Promise<GenerateStructuredResult> {
  const started = performance.now();

  if (options.binding.provider === "anthropic") {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (apiKey) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: options.binding.model,
            // 2048, not the original 1024 or the briefly-tried 4096 -- a
            // live end-to-end test (2026-07-21) found both failure modes:
            // 1024 truncated specialist/validator responses mid-sentence
            // (why validator_indicators never reached its required
            // Assessment line); 4096 fixed that but pushed total wall-clock
            // time for a 2-retry M&E run past the Edge Function platform's
            // wall-clock limit (150s free / 400s paid -- see
            // PHASE1_RESCOPING.md's follow-up note on this). 2048 is a
            // pragmatic middle ground, not a proven-sufficient value --
            // the real fix is moving multi-call, retry-capable workflows
            // off a single synchronous request (Supabase's own guidance:
            // background jobs/queues), which is a Phase 2+ architecture
            // decision, not a token-count tweak. Existing short-form
            // ministries (research/writing) stay well under any of these
            // caps, so this shared default change doesn't affect them.
            max_tokens: 2048,
            tools: [{
              name: options.schemaName,
              description: `Return output conforming exactly to the ${options.schemaName} schema. Call this tool with the result — do not respond in free text.`,
              input_schema: options.schema,
            }],
            tool_choice: { type: "tool", name: options.schemaName },
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
        const data = await res.json();
        const toolUse = (data.content ?? []).find((block: { type: string }) => block.type === "tool_use");
        if (!toolUse) throw new Error("Anthropic response contained no tool_use block despite forced tool_choice");
        const tokenCost = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
        return {
          output: toolUse.input as Record<string, unknown>,
          tokenCost,
          latencyMs: performance.now() - started,
          usedProvider: "anthropic",
        };
      } catch (err) {
        console.error("[llm-gateway] Anthropic structured call failed, falling back to mock:", (err as Error).message);
      }
    }
  }

  // Gemini has no forced-tool-call path wired here yet — no existing agent
  // uses Gemini with strict_output_enabled, so this isn't a gap being
  // carried silently; it falls through to the mock below like any
  // unconfigured or failed provider.

  const output = options.mock();
  return { output, tokenCost: null, latencyMs: performance.now() - started, usedProvider: "mock" };
}

export async function generateText(prompt: string, options: GenerateOptions): Promise<GenerateResult> {
  const started = performance.now();

  if (options.binding.provider === "anthropic") {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (apiKey) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: options.binding.model,
            // 2048 -- see generateStructured's comment above for the full
            // rationale (1024 truncated, 4096 hit the wall-clock limit).
            // The same truncation risk applies to any plain-text agent with
            // a verbose prompt (specialist_me_framework included, confirmed
            // truncated in the same live test).
            max_tokens: 2048,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
        const data = await res.json();
        const text = data.content?.[0]?.text ?? "";
        const tokenCost = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
        return { text, tokenCost, latencyMs: performance.now() - started, usedProvider: "anthropic" };
      } catch (err) {
        console.error("[llm-gateway] Anthropic call failed, falling back to mock:", (err as Error).message);
      }
    }
  }

  if (options.binding.provider === "gemini") {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (apiKey) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${options.binding.model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          },
        );
        if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        const tokenCost = data.usageMetadata?.totalTokenCount ?? null;
        return { text, tokenCost, latencyMs: performance.now() - started, usedProvider: "gemini" };
      } catch (err) {
        console.error("[llm-gateway] Gemini call failed, falling back to mock:", (err as Error).message);
      }
    }
  }

  // mock provider, or fallback from a failed/unconfigured real call
  const text = options.mock();
  return { text, tokenCost: null, latencyMs: performance.now() - started, usedProvider: "mock" };
}
