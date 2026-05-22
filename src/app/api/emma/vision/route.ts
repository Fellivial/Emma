import { MODEL_VISION } from "@/core/models";
import { NextRequest, NextResponse } from "next/server";
import type { VisionApiRequest, VisionApiResponse, VisionAnalysis } from "@/types/emma";
import { getUser } from "@/lib/supabase/server";

const ANTHROPIC_FILES_URL = "https://api.anthropic.com/v1/files";

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

/**
 * Upload a base64-encoded image to the Anthropic Files API.
 * Returns the file_id on success, or null on failure (callers fall back to base64).
 */
async function uploadFrameToFilesApi(
  apiKey: string,
  base64Data: string,
  mediaType: string
): Promise<string | null> {
  try {
    const buffer = Buffer.from(base64Data, "base64");
    const ext = mediaType.split("/")[1]?.split(";")[0] || "jpg";
    const blob = new Blob([buffer], { type: mediaType });
    const form = new FormData();
    form.append("file", blob, `vision-frame.${ext}`);

    const res = await fetch(ANTHROPIC_FILES_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "files-api-2025-04-14",
      },
      body: form,
    });

    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.id === "string" ? data.id : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ analysis: null, error: "Unauthorized" } as VisionApiResponse, {
      status: 401,
    });
  }

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
    let { fileId } = body;

    if (!frame && !fileId) {
      return NextResponse.json(
        { analysis: null, error: "No frame provided" } as VisionApiResponse,
        { status: 400 }
      );
    }

    // Upload frame to Files API if no cached file_id was provided.
    // On upload failure, falls back to inline base64 so vision always works.
    if (!fileId && frame) {
      fileId = (await uploadFrameToFilesApi(apiKey, frame, mediaType || "image/jpeg")) ?? undefined;
    }

    const imageSource: Record<string, unknown> = fileId
      ? { type: "file", file_id: fileId }
      : { type: "base64", media_type: mediaType || "image/jpeg", data: frame };

    const userContent: Array<Record<string, unknown>> = [
      { type: "image", source: imageSource },
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
        "anthropic-beta": "files-api-2025-04-14",
      },
      body: JSON.stringify({
        model: MODEL_VISION,
        max_tokens: 512,
        system: VISION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
        output_config: { format: { type: "json_schema", json_schema: VISION_OUTPUT_SCHEMA } },
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

    return NextResponse.json({ analysis, fileId } as VisionApiResponse);
  } catch (err) {
    console.error("[EMMA Vision API] Unexpected error:", err);
    return NextResponse.json({ analysis: null, error: String(err) } as VisionApiResponse, {
      status: 500,
    });
  }
}
