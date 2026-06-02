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
import { OPENROUTER_URL, openRouterHeaders, extractText } from "@/lib/openrouter";

export async function POST(req: NextRequest) {
  try {
    // Get authenticated user; dev mode (no Supabase) uses a fixed stub
    let userId: string;
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const user = await getUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      userId = user.id;
    } else {
      userId = "dev-user";
    }

    const body = (await req.json()) as MemoryApiRequest;

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

        const memorySchema = {
          type: "object",
          properties: {
            memories: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: {
                    type: "string",
                    enum: [
                      "preference",
                      "habit",
                      "personal",
                      "goal",
                      "relationship",
                      "context",
                      "constraint",
                    ],
                  },
                  key: { type: "string" },
                  value: { type: "string" },
                  confidence: { type: "number" },
                },
                required: ["category", "key", "value", "confidence"],
                additionalProperties: false,
              },
            },
          },
          required: ["memories"],
          additionalProperties: false,
        };

        const res = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: openRouterHeaders(),
          body: JSON.stringify({
            model: MODEL_UTILITY,
            max_tokens: 512,
            messages: [
              { role: "system", content: MEMORY_EXTRACTION_PROMPT },
              {
                role: "user",
                content: body.conversationText,
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: { name: "memory_extraction", schema: memorySchema },
            },
          }),
        });

        if (!res.ok) {
          return NextResponse.json({ error: `API ${res.status}` }, { status: 502 });
        }

        const data = await res.json();
        const rawText = extractText(data) || '{"memories":[]}';

        // Structured output guarantees valid JSON — no cleanup needed.
        let parsed: Array<{ category: string; key: string; value: string; confidence: number }>;
        try {
          parsed = (JSON.parse(rawText) as { memories: typeof parsed }).memories;
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
    return NextResponse.json({ error: "Memory operation failed" }, { status: 500 });
  }
}
