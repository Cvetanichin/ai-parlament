// ADR-0010 §2: narrow, single-purpose Embedding Gateway. The sole caller
// of the embedding provider from this platform. When the full multi-
// provider LLM Gateway (EAS §3.4) eventually lands, this module's HTTP
// call is refactored to route through it — planned migration, not a
// permanent parallel provider path.
//
// Provider: OpenAI, text-embedding-3-small, 1536 dimensions (matches the
// existing schema exactly per ADR-0010 §2). API key lives in Supabase
// Vault and is read at invocation time as an environment secret — never
// passed as a parameter, logged, or returned in any response (§6).

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

// text-embedding-3-small pricing as of ADR-0010 approval, USD per 1M
// input tokens. Kept here so the output contract's estimated_cost_usd can
// be computed without a live pricing lookup on every call.
const USD_PER_MILLION_INPUT_TOKENS = 0.02;

export interface EmbeddingBatchResult {
  vectors: number[][]; // one per input, in order
  totalTokens: number;
  model: string;
  estimatedCostUsd: number;
  durationMs: number;
}

export class EmbeddingProviderError extends Error {
  readonly status: number;
  readonly retriable: boolean;
  constructor(message: string, status: number, retriable: boolean) {
    super(message);
    this.status = status;
    this.retriable = retriable;
  }
}

// ADR-0010 §9 step 5: on 429, back off and retry up to 3 times with
// exponential backoff before marking the batch as failed. `attempts`
// counts total tries (initial + retries), so 4 = initial + 3 retries.
export async function embedBatch(inputs: string[]): Promise<EmbeddingBatchResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new EmbeddingProviderError(
      "OPENAI_API_KEY is not set in the function environment (Supabase Vault)",
      500,
      false,
    );
  }
  if (inputs.length === 0) {
    throw new EmbeddingProviderError("embedBatch called with empty input list", 400, false);
  }

  const started = performance.now();
  const maxAttempts = 4;
  let lastErr: EmbeddingProviderError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: inputs,
          encoding_format: "float",
        }),
      });

      if (res.status === 429 || res.status >= 500) {
        const body = await res.text();
        lastErr = new EmbeddingProviderError(
          `OpenAI embeddings ${res.status}: ${body.slice(0, 400)}`,
          res.status,
          true,
        );
        if (attempt < maxAttempts) {
          const backoffMs = 500 * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        throw lastErr;
      }
      if (!res.ok) {
        const body = await res.text();
        throw new EmbeddingProviderError(
          `OpenAI embeddings ${res.status}: ${body.slice(0, 400)}`,
          res.status,
          false,
        );
      }

      const data = await res.json() as {
        data: Array<{ embedding: number[]; index: number }>;
        model: string;
        usage: { prompt_tokens: number; total_tokens: number };
      };

      if (!Array.isArray(data.data) || data.data.length !== inputs.length) {
        throw new EmbeddingProviderError(
          `OpenAI embeddings returned ${data.data?.length ?? 0} vectors for ${inputs.length} inputs`,
          500,
          false,
        );
      }
      // API guarantees ordering by `index` — sort defensively before extracting.
      const vectors = [...data.data]
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
      const totalTokens = data.usage?.total_tokens ?? 0;
      return {
        vectors,
        totalTokens,
        model: data.model ?? EMBEDDING_MODEL,
        estimatedCostUsd: (totalTokens * USD_PER_MILLION_INPUT_TOKENS) / 1_000_000,
        durationMs: performance.now() - started,
      };
    } catch (err) {
      if (err instanceof EmbeddingProviderError) {
        if (err.retriable && attempt < maxAttempts) {
          lastErr = err;
          const backoffMs = 500 * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        throw err;
      }
      const wrapped = new EmbeddingProviderError((err as Error).message, 0, true);
      if (attempt < maxAttempts) {
        lastErr = wrapped;
        const backoffMs = 500 * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
      throw wrapped;
    }
  }

  throw lastErr ?? new EmbeddingProviderError("embedBatch exhausted retries", 0, true);
}

// pgvector's text input format is `[0.1,0.2,…]`. The RPC casts each
// element via `(r->>'embedding')::vector`, so we send a bare JSON string
// that matches that literal shape.
export function toPgVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
