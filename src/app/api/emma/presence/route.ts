import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { getCompanionState, saveCompanionState } from "@/core/companion-state";

/**
 * Companion presence state (ADR 0002).
 *
 * GET  → the user's decrypted companion state (null when absent/stale).
 * PUT  → client write-back of the two client-originated fields only:
 *        lastGreetingContext (bounded greeting bucket) and
 *        lastProactiveTopic. Mood/emotion/summary are written server-side
 *        by the brain route and cannot be set from the client.
 */

// Greeting buckets the greeting engine can report back (bounded enum —
// stored plaintext per ADR 0002, so validation is strict).
const GREETING_CONTEXTS = new Set([
  "first_visit",
  "morning",
  "afternoon",
  "evening",
  "night",
  "late_night",
  "quick_return",
  "normal_return",
  "long_absence",
  "very_long_absence",
]);

const MAX_TOPIC_LENGTH = 120;

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await getCompanionState(user.id);
  return NextResponse.json({ state }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const patch: {
      lastGreetingContext?: string;
      lastProactiveTopic?: string;
    } = {};

    if (typeof body.lastGreetingContext === "string") {
      if (!GREETING_CONTEXTS.has(body.lastGreetingContext)) {
        return NextResponse.json({ error: "Invalid greeting context" }, { status: 400 });
      }
      patch.lastGreetingContext = body.lastGreetingContext;
    }

    if (typeof body.lastProactiveTopic === "string") {
      const topic = body.lastProactiveTopic.trim().slice(0, MAX_TOPIC_LENGTH);
      if (topic) patch.lastProactiveTopic = topic;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    await saveCompanionState(user.id, patch);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
