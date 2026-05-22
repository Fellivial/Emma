import { MODEL_UTILITY } from "@/core/models";
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";

const EMOTION_VISION_PROMPT = `Analyze the facial expression in the webcam frame for an emotion detection system.

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
      enum: ["neutral","happy","sad","angry","anxious","tired","excited","frustrated","calm","stressed"],
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

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "API key not set" }, { status: 500 });
  }

  try {
    const { frame, source } = await req.json();

    if (!frame) {
      return NextResponse.json({ error: "No frame provided" }, { status: 400 });
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL_UTILITY,
        max_tokens: 256,
        system: EMOTION_VISION_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: frame,
                },
              },
              { type: "text", text: "Analyze the facial expression." },
            ],
          },
        ],
        output_config: {
          format: {
            type: "json_schema",
            json_schema: { name: "emotion_analysis", schema: EMOTION_OUTPUT_SCHEMA },
          },
        },
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `API ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const rawText =
      data.content
        ?.map((b: { type: string; text?: string }) => (b.type === "text" ? b.text : ""))
        .join("") || "";

    try {
      // With structured outputs the response is guaranteed-valid JSON — no cleanup needed.
      const emotion = JSON.parse(rawText);
      return NextResponse.json({ emotion });
    } catch {
      return NextResponse.json({
        emotion: { primary: "neutral", confidence: 0.1, valence: 0, arousal: 0.3 },
      });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
