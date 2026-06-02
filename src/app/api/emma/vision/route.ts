import { VISION_MODELS } from "@/core/models";
import { NextRequest, NextResponse } from "next/server";
import type { VisionApiRequest, VisionApiResponse, VisionAnalysis } from "@/types/emma";
import { getUser } from "@/lib/supabase/server";
import { OPENROUTER_URL, openRouterHeaders, extractText } from "@/lib/openrouter";

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

    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: openRouterHeaders(),
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

    if (!res.ok) {
      const errText = await res.text();
      console.error("[EMMA Vision API] OpenRouter error:", res.status, errText);
      return NextResponse.json(
        { analysis: null, error: `API ${res.status}` } as VisionApiResponse,
        { status: 502 }
      );
    }

    const data = await res.json();
    const rawText = extractText(data);

    let parsed: {
      description: string;
      objects: string[];
      activities: string[];
      anomalies: string[];
    };

    try {
      parsed = JSON.parse(rawText);
    } catch {
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
