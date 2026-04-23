import { MODEL_VISION } from "@/core/models";
import { NextRequest, NextResponse } from "next/server";
import type { VisionApiRequest, VisionApiResponse, VisionAnalysis } from "@/types/emma";

const VISION_SYSTEM_PROMPT = `You are EMMA's vision subsystem. You analyze screenshots of the user's screen.

Respond ONLY with a JSON object (no markdown, no backticks, no preamble):
{
  "description": "One paragraph describing what you see on the screen",
  "objects": ["list", "of", "notable", "UI", "elements", "or", "content"],
  "activities": ["what", "the", "user", "appears", "to", "be", "doing"],
  "anomalies": ["anything", "unusual", "errors", "or", "noteworthy"]
}

Focus on:
- What application/website is open
- What the user appears to be working on
- Key content visible (documents, code, messages, media)
- Any errors, warnings, or issues visible
- Overall context that helps you assist the user

IMPORTANT: Never read or report passwords, credit card numbers, private keys, or other sensitive data.
If you see sensitive fields, note "sensitive data visible" without reading the content.

Be concise but thorough. This data feeds into your ability to help the user contextually.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { analysis: null, error: "ANTHROPIC_API_KEY not set" } as VisionApiResponse,
      { status: 500 }
    );
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

    const userContent: Array<Record<string, unknown>> = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType || "image/jpeg",
          data: frame,
        },
      },
      {
        type: "text",
        text: context
          ? `Analyze this scene. Additional context: ${context}`
          : "Analyze this scene.",
      },
    ];

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL_VISION,
        max_tokens: 512,
        system: VISION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[EMMA Vision API] Anthropic error:", res.status, errText);
      return NextResponse.json(
        { analysis: null, error: `Anthropic API ${res.status}` } as VisionApiResponse,
        { status: 502 }
      );
    }

    const data = await res.json();
    const rawText =
      data.content
        ?.map((b: { type: string; text?: string }) => (b.type === "text" ? b.text : ""))
        .join("") || "";

    // Parse the JSON response
    let parsed: {
      description: string;
      objects: string[];
      activities: string[];
      anomalies: string[];
    };

    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // Fallback: treat entire response as description
      parsed = {
        description: rawText,
        objects: [],
        activities: [],
        anomalies: [],
      };
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
      { analysis: null, error: String(err) } as VisionApiResponse,
      { status: 500 }
    );
  }
}
