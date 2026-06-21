import { enforceCostGate, recordCostResult, type CostGateInput } from "@/core/cost-gate";

const EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";
const EMBEDDING_MODEL = "openai/text-embedding-3-small";

function headers() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    "HTTP-Referer": "https://emma.app",
    "X-Title": "Emma",
  };
}

type EmbeddingResponse = {
  data: Array<{ embedding: number[]; index: number }>;
  usage?: { prompt_tokens?: number; total_tokens?: number };
};

type EmbeddingCostContext = Pick<CostGateInput, "userId" | "clientId" | "planId">;

export async function embedBatch(
  texts: string[],
  context: EmbeddingCostContext
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const cost = await enforceCostGate({ operation: "embeddings", ...context });
  if (!cost.allowed) throw new Error(cost.message);
  const res = await fetch(EMBEDDINGS_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });
  if (!res.ok) {
    await recordCostResult(cost, { success: false });
    const body = await res.text().catch(() => "");
    throw new Error(`Embeddings API ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as EmbeddingResponse;
  await recordCostResult(cost, {
    inputTokens: json.usage?.prompt_tokens ?? json.usage?.total_tokens ?? texts.length,
    success: true,
  });
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function embedText(text: string, context: EmbeddingCostContext): Promise<number[]> {
  const [embedding] = await embedBatch([text], context);
  return embedding;
}
