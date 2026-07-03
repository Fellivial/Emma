import { UTILITY_MODELS } from "@/core/models";
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { OPENROUTER_URL, openRouterHeaders, extractText, extractUsage } from "@/lib/openrouter";
import { enforceCostGate, recordCostResult, costGateResponse } from "@/core/cost-gate";

const EMOTION_VISION_PROMPT = `Analyze the facial expression of any person visible in the provided frame (a screen capture, which may include a webcam feed or video call) for an emotion detection system.

Emotion labels: neutral, happy, sad, angry, anxious, tired, excited, frustrated, calm, stressed.
Valence: -1 = very negative, 0 = neutral, 1 = very positive.
Arousal: 0 = very calm/sleepy, 1 = very energetic/agitated.
Confidence: 0–1, use 0.1 when no face is clearly visible.

Base your analysis on facial muscle tension (brow, jaw, mouth corners), eye openness and gaze direction, overall posture if visible, and skin color/flushing.`;

const EMOTION_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    primary: {
      type: "string",
      enum: [
        "neutral",
        "happy",
        "sad",
        "angry",
        "anxious",
        "tired",
        "excited",
        "frustrated",
        "calm",
        "stressed",
      ],
    },
    confidence: { type: "number" },
    valence: { type: "number" },
    arousal: { type: "number" },
  },
  required: ["primary", "confidence", "valence", "arousal"],
  additionalProperties: false,
} as const;

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { frame } = await req.json();

    if (!frame) {
      return NextResponse.json({ error: "No frame provided" }, { status: 400 });
    }

    if (typeof frame === "string" && frame.length > 700_000) {
      return NextResponse.json({ error: "Frame too large" }, { status: 413 });
    }

    const cost = await enforceCostGate({ operation: "emotion", userId: user.id });
    if (!cost.allowed) return costGateResponse(cost);

    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: openRouterHeaders(),
      body: JSON.stringify({
        models: UTILITY_MODELS,
        max_tokens: 256,
        messages: [
          { role: "system", content: EMOTION_VISION_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${frame}` },
              },
              { type: "text", text: "Analyze the facial expression." },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "emotion_analysis", schema: EMOTION_OUTPUT_SCHEMA },
        },
      }),
    });

    if (!res.ok) {
      await recordCostResult(cost, { success: false });
      return NextResponse.json({ error: `API ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    await recordCostResult(cost, { ...extractUsage(data), success: true });
    const rawText = extractText(data);

    try {
      // With structured outputs the response is guaranteed-valid JSON — no cleanup needed.
      const emotion = JSON.parse(rawText);
      return NextResponse.json({ emotion });
    } catch {
      return NextResponse.json({
        emotion: { primary: "neutral", confidence: 0.1, valence: 0, arousal: 0.3 },
      });
    }
  } catch {
    return NextResponse.json({ error: "Emotion analysis failed" }, { status: 500 });
  }
}
