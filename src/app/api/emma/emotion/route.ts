import { VISION_TIMEOUT_MS } from "@/core/models";
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { brainChat, type BrainChatResult } from "@/core/brain/gateway";
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

    let result: BrainChatResult;
    try {
      result = await brainChat({
        // This is an image_url call: the vision task tier must only ever hit
        // vision-capable models. The utility fallback chain contains text-only
        // models that would "analyze" a frame they cannot see.
        task: "vision",
        maxTokens: 256,
        // Same bound as the vision route — this call carries a frame too.
        timeoutMs: VISION_TIMEOUT_MS,
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
        responseFormat: {
          name: "emotion_analysis",
          schema: EMOTION_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
        },
      });
    } catch {
      await recordCostResult(cost, { success: false });
      // Fail-soft: emotion is one fusion signal among three — a neutral
      // low-confidence reading lets fusion continue instead of erroring.
      console.warn("[EMMA Emotion API] Upstream call failed — returning neutral");
      return NextResponse.json({
        emotion: { primary: "neutral", confidence: 0.1, valence: 0, arousal: 0.3 },
      });
    }

    if (!result.ok) {
      await recordCostResult(cost, { success: false });
      return NextResponse.json({ error: `API ${result.error.status}` }, { status: 502 });
    }

    await recordCostResult(cost, { ...result.usage, success: true });
    const rawText = result.text;

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
