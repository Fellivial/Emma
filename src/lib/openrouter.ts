export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export function openRouterHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
    "HTTP-Referer": "https://emma.app",
    "X-Title": "Emma",
  };
}

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export function extractText(data: unknown): string {
  return (data as OpenRouterResponse).choices?.[0]?.message?.content ?? "";
}

export function extractUsage(data: unknown): {
  inputTokens: number;
  outputTokens: number;
} {
  const usage = (data as OpenRouterResponse).usage;
  return {
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
  };
}
