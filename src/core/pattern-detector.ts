/**
 * Pattern Detector — cross-task analysis.
 *
 * Runs as a daily cron (02:00 UTC). Looks at the last 30 days of completed
 * tasks and detects:
 *   - Daily recurring goals (same intent, ≥5 days in last 14)
 *   - Weekly recurring goals (≥3 of last 4 weeks)
 *   - Repeated tool sequences (same ordered tool chain, ≥4 occurrences)
 *
 * For each detected pattern it calls Haiku to generate a scheduling suggestion
 * in Emma's voice, then upserts to pattern_detections.
 */

import { MODEL_UTILITY } from "@/core/models";
import { createClient } from "@supabase/supabase-js";
import { fetchWithRetry } from "@/lib/errors";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DetectedPattern {
  userId: string;
  patternType: "daily" | "weekly" | "tool_sequence";
  description: string;
  frequency: number;
  exampleGoals: string[];
  toolSequence?: string[];
  suggestion: string;
}

// ─── Suggestion Generator ─────────────────────────────────────────────────────

const SUGGESTION_SYSTEM = `You are Emma, an AI personal assistant. Write a single short scheduling suggestion (1 sentence, max 20 words) in Emma's warm, slightly intimate voice.
Given a pattern of recurring tasks, suggest automating it. Be specific about timing. No markdown.`;

async function generateSuggestion(
  apiKey: string,
  patternType: string,
  description: string,
  exampleGoals: string[]
): Promise<string> {
  try {
    const res = await fetchWithRetry(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL_UTILITY,
          max_tokens: 80,
          system: SUGGESTION_SYSTEM,
          messages: [
            {
              role: "user",
              content: `Pattern type: ${patternType}\nDescription: ${description}\nExample tasks: ${exampleGoals.slice(0, 3).join("; ")}`,
            },
          ],
        }),
      },
      { maxRetries: 1 }
    );

    if (!res.ok) return `I noticed you do "${description}" regularly — want me to schedule this automatically?`;
    const data = await res.json();
    return data.content?.[0]?.text?.trim() || "";
  } catch {
    return `I noticed you do "${description}" regularly — want me to schedule this automatically?`;
  }
}

// ─── Clustering Helpers ──────────────────────────────────────────────────────

function goalSlug(goal: string): string {
  // Normalize: lowercase, strip numbers/dates/punctuation
  return goal
    .toLowerCase()
    .replace(/\b\d{1,4}[-/]\d{1,2}[-/]\d{1,4}\b/g, "")
    .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function isSimilar(a: string, b: string): boolean {
  const longer = Math.max(a.length, b.length);
  if (longer === 0) return true;
  return levenshtein(a, b) / longer < 0.35;
}

// Group goals into clusters of similar tasks
function clusterGoals(goals: Array<{ goal: string; createdAt: Date }>): Map<string, Array<{ goal: string; createdAt: Date }>> {
  const clusters = new Map<string, Array<{ goal: string; createdAt: Date }>>();
  const slugMap = new Map<string, string>(); // slug → representative slug

  for (const item of goals) {
    const slug = goalSlug(item.goal);
    let found = false;

    for (const [rep] of clusters) {
      if (isSimilar(slug, rep)) {
        clusters.get(rep)!.push(item);
        found = true;
        break;
      }
    }

    if (!found) {
      clusters.set(slug, [item]);
    }
  }

  return clusters;
}

// ─── Pattern Detection ───────────────────────────────────────────────────────

export async function detectPatterns(userId: string): Promise<DetectedPattern[]> {
  const supabase = getSupabase();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!supabase || !apiKey) return [];

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, goal, status, trigger_type, created_at, action_log(action)")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  if (!tasks || tasks.length < 3) return [];

  const patterns: DetectedPattern[] = [];

  const goalItems = tasks.map((t: any) => ({
    goal: t.goal as string,
    createdAt: new Date(t.created_at),
  }));

  const clusters = clusterGoals(goalItems);

  for (const [rep, items] of clusters) {
    if (items.length < 4) continue;

    const dayBuckets = new Set(items.map((i) => i.createdAt.toDateString()));
    const weekBuckets = new Set(
      items.map((i) => {
        const d = i.createdAt;
        const jan1 = new Date(d.getFullYear(), 0, 1);
        return `${d.getFullYear()}-W${Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)}`;
      })
    );

    // Daily: ≥5 distinct days in last 14 days
    const last14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const recentDays = new Set(
      items
        .filter((i) => i.createdAt >= last14)
        .map((i) => i.createdAt.toDateString())
    );

    if (recentDays.size >= 5) {
      const suggestion = await generateSuggestion(apiKey, "daily", rep, items.map((i) => i.goal));
      patterns.push({
        userId,
        patternType: "daily",
        description: rep,
        frequency: recentDays.size,
        exampleGoals: items.slice(-3).map((i) => i.goal),
        suggestion,
      });
      continue;
    }

    // Weekly: ≥3 of the last 4 calendar weeks
    const now = new Date();
    const weekCounts = Array.from({ length: 4 }, (_, i) => {
      const wkStart = new Date(now);
      wkStart.setDate(now.getDate() - (i + 1) * 7);
      const wkEnd = new Date(now);
      wkEnd.setDate(now.getDate() - i * 7);
      return items.filter((it) => it.createdAt >= wkStart && it.createdAt < wkEnd).length;
    });
    const weeksWithActivity = weekCounts.filter((c) => c > 0).length;

    if (weeksWithActivity >= 3) {
      const suggestion = await generateSuggestion(apiKey, "weekly", rep, items.map((i) => i.goal));
      patterns.push({
        userId,
        patternType: "weekly",
        description: rep,
        frequency: weeksWithActivity,
        exampleGoals: items.slice(-3).map((i) => i.goal),
        suggestion,
      });
    }
  }

  // Tool-sequence patterns: find repeated ordered sequences of ≥2 tools
  const sequences = new Map<string, { count: number; exampleGoals: string[] }>();

  for (const task of tasks as any[]) {
    const actions: string[] = (task.action_log || []).map((a: any) => a.action as string);
    if (actions.length < 2) continue;

    // Use the first 4 tools as the fingerprint
    const seq = actions.slice(0, 4).join(" → ");
    const existing = sequences.get(seq);
    if (existing) {
      existing.count++;
      if (existing.exampleGoals.length < 3) existing.exampleGoals.push(task.goal);
    } else {
      sequences.set(seq, { count: 1, exampleGoals: [task.goal] });
    }
  }

  for (const [seq, { count, exampleGoals }] of sequences) {
    if (count < 4) continue;
    const suggestion = await generateSuggestion(apiKey, "tool_sequence", seq, exampleGoals);
    patterns.push({
      userId,
      patternType: "tool_sequence",
      description: `Repeated sequence: ${seq}`,
      frequency: count,
      exampleGoals,
      toolSequence: seq.split(" → "),
      suggestion,
    });
  }

  return patterns;
}

// ─── Persistence ─────────────────────────────────────────────────────────────

export async function persistPatterns(patterns: DetectedPattern[]): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || patterns.length === 0) return;

  const rows = patterns.map((p) => ({
    user_id: p.userId,
    pattern_type: p.patternType,
    description: p.description,
    frequency: p.frequency,
    example_goals: p.exampleGoals,
    tool_sequence: p.toolSequence || null,
    suggestion: p.suggestion,
    status: "pending",
    detected_at: new Date().toISOString(),
  }));

  // Upsert on (user_id, description) — avoids duplicating the same pattern
  await supabase.from("pattern_detections").upsert(rows, {
    onConflict: "user_id,description",
  });
}
