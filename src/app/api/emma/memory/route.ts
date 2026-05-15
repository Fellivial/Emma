import { MODEL_UTILITY } from "@/core/models";
import { NextRequest, NextResponse } from "next/server";
import type { MemoryApiRequest, MemoryApiResponse, MemoryEntry } from "@/types/emma";
import {
  getMemoriesForUser,
  addMemoryForUser,
  addMemoriesForUser,
  deleteMemoryForUser,
} from "@/core/memory-db";
import { MEMORY_EXTRACTION_PROMPT } from "@/core/memory-shared";
import { getUser } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    // Get authenticated user (fallback to body.userId for dev)
    let userId: string | null = null;
    try {
      const user = await getUser();
      userId = user?.id || null;
    } catch {
      // Auth not configured — allow unauthenticated in dev
    }

    const body = (await req.json()) as MemoryApiRequest & { userId?: string };
    userId = userId || body.userId || "dev-user";

    switch (body.action) {
      case "get": {
        const entries = await getMemoriesForUser(userId, body.category);
        return NextResponse.json({ entries } satisfies MemoryApiResponse);
      }

      case "add": {
        if (!body.entry) {
          return NextResponse.json({ error: "No entry provided" }, { status: 400 });
        }
        const result = await addMemoryForUser(userId, {
          category: body.entry.category || "personal",
          key: body.entry.key || "unknown",
          value: body.entry.value || "",
          confidence: body.entry.confidence ?? 0.8,
          source: body.entry.source || "explicit",
        });
        return NextResponse.json({ entries: result ? [result] : [] } satisfies MemoryApiResponse);
      }

      case "delete": {
        if (!body.entry?.id) {
          return NextResponse.json({ error: "No entry id" }, { status: 400 });
        }
        await deleteMemoryForUser(userId, body.entry.id);
        return NextResponse.json({ entries: [] } satisfies MemoryApiResponse);
      }

      case "extract": {
        if (!body.conversationText) {
          return NextResponse.json({ extracted: [] } satisfies MemoryApiResponse);
        }

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          return NextResponse.json({ error: "API key not set" }, { status: 500 });
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
            max_tokens: 512,
            system: MEMORY_EXTRACTION_PROMPT,
            messages: [
              {
                role: "user",
                content: `Extract memories from this conversation:\n\n${body.conversationText}`,
              },
            ],
          }),
        });

        if (!res.ok) {
          return NextResponse.json({ error: `API ${res.status}` }, { status: 502 });
        }

        const data = await res.json();
        const rawText =
          data.content
            ?.map((b: { type: string; text?: string }) => (b.type === "text" ? b.text : ""))
            .join("") || "[]";

        let parsed: Array<{ category: string; key: string; value: string; confidence: number }>;
        try {
          parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());
        } catch {
          parsed = [];
        }

        const toStore = parsed
          .filter((p) => p.confidence >= 0.5)
          .map((p) => ({
            category: p.category as MemoryEntry["category"],
            key: p.key,
            value: p.value,
            confidence: p.confidence,
            source: "extracted" as const,
          }));

        const extracted = await addMemoriesForUser(userId, toStore);
        return NextResponse.json({ extracted } satisfies MemoryApiResponse);
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    console.error("[EMMA Memory API] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
