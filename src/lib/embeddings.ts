import { enforceCostGate, recordCostResult, type CostGateInput } from "@/core/cost-gate";
import { brainEmbed } from "@/core/brain/gateway";

type EmbeddingCostContext = Pick<CostGateInput, "userId" | "clientId" | "planId">;

export async function embedBatch(
  texts: string[],
  context: EmbeddingCostContext
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const cost = await enforceCostGate({ operation: "embeddings", ...context });
  if (!cost.allowed) throw new Error(cost.message);
  const result = await brainEmbed({ texts });
  if (!result.ok) {
    await recordCostResult(cost, { success: false });
    throw new Error(`Embeddings API ${result.error.status}: ${result.error.bodyPreview}`);
  }
  await recordCostResult(cost, {
    inputTokens: result.usage.inputTokens ?? texts.length,
    success: true,
  });
  return result.embeddings;
}

export async function embedText(text: string, context: EmbeddingCostContext): Promise<number[]> {
  const [embedding] = await embedBatch([text], context);
  return embedding;
}
