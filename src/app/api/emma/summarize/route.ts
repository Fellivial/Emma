import { MODEL_UTILITY } from "@/core/models";
import { NextRequest, NextResponse } from "next/server";

const SUMMARIZE_SYSTEM_PROMPT = `You are a conversation summarizer for a smart home AI agent called Emma. Your job is to compress conversation history into a compact summary that preserves all important context.

Rules:
- Output ONLY the summary text, no preamble, no markdown formatting
- Preserve: user preferences mentioned, device commands given, emotional moments, key decisions, promises made, names, personal details
- Discard: small talk, repeated commands, filler, exact phrasing (paraphrase instead)
- If a previous summary is provided, merge it with the new messages — don't repeat what's already summarized
- Keep the summary under 500 words
- Write in third person past tense: "The user asked Emma to...", "Emma turned on the lights..."
- Prioritize recent context over older context when space is tight
- Note any emotional patterns: "The user seemed stressed", "The conversation had a playful tone"

This summary will be injected into future conversations so Emma can maintain continuity.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "API key not set" }, { status: 500 });
  }

  try {
    const { text } = await req.json();

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ summary: "" });
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
        max_tokens: 1024,
        system: SUMMARIZE_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Summarize this conversation history:\n\n${text}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[EMMA Summarize] API error:", res.status, errText);
      return NextResponse.json(
        { error: `API ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const summary =
      data.content
        ?.map((b: { type: string; text?: string }) =>
          b.type === "text" ? b.text : ""
        )
        .join("") || "";

    return NextResponse.json({ summary: summary.trim() });
  } catch (err) {
    console.error("[EMMA Summarize] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
