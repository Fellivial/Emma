import { VISION_MODELS, VISION_TIMEOUT_MS } from "@/core/models";
import { NextRequest, NextResponse } from "next/server";
import type { VisionApiRequest, VisionApiResponse, VisionAnalysis } from "@/types/emma";
import { getUser } from "@/lib/supabase/server";
import { OPENROUTER_URL, openRouterHeaders, extractText, extractUsage } from "@/lib/openrouter";
import { enforceCostGate, recordCostResult, costGateResponse } from "@/core/cost-gate";

const VISION_SYSTEM_PROMPT = `You are EMMA's vision subsystem. You analyze screenshots of the user's screen.

Focus on:
- What application/website is open
- What the user appears to be working on
- Key content visible (documents, code, messages, media)
- Any errors, warnings, or issues visible
- Overall context that helps you assist the user

IMPORTANT: Never read or report passwords, credit card numbers, private keys, or other sensitive data.
If you see sensitive fields, note "sensitive data visible" without reading the content.

Be concise but thorough. This data feeds into your ability to help the user contextually.`;

const VISION_OUTPUT_SCHEMA = {
  name: "vision_analysis",
  schema: {
    type: "object",
    properties: {
      description: { type: "string" },
      objects: { type: "array", items: { type: "string" } },
      activities: { type: "array", items: { type: "string" } },
      anomalies: { type: "array", items: { type: "string" } },
    },
    required: ["description", "objects", "activities", "anomalies"],
    additionalProperties: false,
  },
};

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ analysis: null, error: "Unauthorized" } as VisionApiResponse, {
      status: 401,
    });
  }

  try {
    const body = (await req.json()) as VisionApiRequest;
    const { frame, mediaType, context } = body;

    if (!frame) {
      return NextResponse.json(
        { analysis: null, error: "No frame provided" } as VisionApiResponse,
        { status: 400 }
      );
    }

    if (typeof frame === "string" && frame.length > 700_000) {
      return NextResponse.json({ analysis: null, error: "Frame too large" } as VisionApiResponse, {
        status: 413,
      });
    }

    const mimeType = mediaType || "image/jpeg";

    const cost = await enforceCostGate({ operation: "vision", userId: user.id });
    if (!cost.allowed) return costGateResponse(cost);

    let res: Response;
    try {
      res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: openRouterHeaders(),
        // Bounded upstream latency — a stalled vision provider must not hold
        // the request (and the client's staleness refresh) open indefinitely.
        signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
        body: JSON.stringify({
          models: VISION_MODELS,
          max_tokens: 512,
          messages: [
            { role: "system", content: VISION_SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url: `data:${mimeType};base64,${frame}` },
                },
                {
                  type: "text",
                  text: context
                    ? `Analyze this scene. Additional context: ${context}`
                    : "Analyze this scene.",
                },
              ],
            },
          ],
          response_format: { type: "json_schema", json_schema: VISION_OUTPUT_SCHEMA },
        }),
      });
    } catch (err) {
      await recordCostResult(cost, { success: false });
      const timedOut = err instanceof DOMException && err.name === "TimeoutError";
      console.error(
        `[EMMA Vision API] ${timedOut ? `Timed out after ${VISION_TIMEOUT_MS}ms` : "Upstream fetch failed:"}`,
        timedOut ? "" : err
      );
      return NextResponse.json(
        {
          analysis: null,
          error: timedOut ? "Vision analysis timed out" : "Vision provider unreachable",
        } as VisionApiResponse,
        { status: timedOut ? 504 : 502 }
      );
    }

    if (!res.ok) {
      await recordCostResult(cost, { success: false });
      const errText = await res.text();
      console.error("[EMMA Vision API] OpenRouter error:", res.status, errText);
      return NextResponse.json(
        { analysis: null, error: `API ${res.status}` } as VisionApiResponse,
        { status: 502 }
      );
    }

    const data = await res.json();
    await recordCostResult(cost, { ...extractUsage(data), success: true });
    const rawText = extractText(data);

    // An empty completion is a failure, not a scene with nothing in it —
    // surfacing it as an empty analysis would silently poison the prompt
    // context and emotion fusion downstream.
    if (!rawText.trim()) {
      console.error("[EMMA Vision API] Empty completion from provider");
      return NextResponse.json(
        { analysis: null, error: "Vision provider returned no analysis" } as VisionApiResponse,
        { status: 502 }
      );
    }

    let parsed: {
      description: string;
      objects: string[];
      activities: string[];
      anomalies: string[];
    };

    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Structured outputs should make this unreachable; keep the raw text
      // as a degraded description but make the degradation observable.
      console.warn("[EMMA Vision API] Non-JSON completion, degrading to raw text");
      parsed = { description: rawText, objects: [], activities: [], anomalies: [] };
    }

    const analysis: VisionAnalysis = {
      id: `vision-${Date.now()}`,
      timestamp: Date.now(),
      description: parsed.description || rawText,
      objects: parsed.objects || [],
      activities: parsed.activities || [],
      anomalies: parsed.anomalies || [],
    };

    return NextResponse.json({ analysis } as VisionApiResponse);
  } catch (err) {
    console.error("[EMMA Vision API] Unexpected error:", err);
    return NextResponse.json(
      { analysis: null, error: "Vision analysis failed" } as VisionApiResponse,
      {
        status: 500,
      }
    );
  }
}
