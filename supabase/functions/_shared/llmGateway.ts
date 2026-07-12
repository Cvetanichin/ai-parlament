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
            max_tokens: 1024,
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
