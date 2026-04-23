import { MODEL_UTILITY } from "@/core/models";
import { NextRequest, NextResponse } from "next/server";

const EMOTION_VISION_PROMPT = `You analyze facial expressions in webcam frames for a smart home agent's emotion detection system.

Respond ONLY with a JSON object (no markdown, no backticks, no preamble):
{
  "primary": "<emotion_label>",
  "confidence": <0.0-1.0>,
  "valence": <-1.0 to 1.0>,
  "arousal": <0.0 to 1.0>
}

Emotion labels: "neutral", "happy", "sad", "angry", "anxious", "tired", "excited", "frustrated", "calm", "stressed"

Valence: -1 = very negative, 0 = neutral, 1 = very positive
Arousal: 0 = very calm/sleepy, 1 = very energetic/agitated

Base your analysis on:
- Facial muscle tension (brow, jaw, mouth corners)
- Eye openness and gaze direction
- Overall posture if visible
- Skin color / flushing

If no face is clearly visible, return: {"primary":"neutral","confidence":0.1,"valence":0,"arousal":0.3}`;

export async function POST(req: NextRequest) {
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
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `API ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const rawText =
      data.content?.map((b: { type: string; text?: string }) =>
        b.type === "text" ? b.text : ""
      ).join("") || "";

    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      const emotion = JSON.parse(cleaned);
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
