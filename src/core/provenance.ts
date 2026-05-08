/**
 * Workflow Provenance — structured step-by-step chain log for agent tasks.
 *
 * Separate from security/audit.ts which logs security events.
 * Persists to Supabase table "provenance_chains" (single JSON column),
 * falling back to data/provenance/{taskId}.json when Supabase is unavailable.
 */

import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProvenanceStep {
  stepNumber: number;
  action: string; // tool name or reasoning step
  input: unknown;
  output: string;
  source: string; // where data came from (e.g. "automated", "human_approved", "web_search")
  verified: boolean; // whether the output was confirmed/approved
  timestamp: number; // Unix ms
  durationMs: number;
}

export interface ProvenanceChain {
  taskId: string;
  goal: string;
  steps: ProvenanceStep[];
  startedAt: number; // Unix ms
  completedAt?: number; // Unix ms
  status: "running" | "completed" | "failed" | "awaiting_approval";
}

// ─── Supabase ─────────────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ─── Core functions ───────────────────────────────────────────────────────────

export function startChain(taskId: string, goal: string): ProvenanceChain {
  return {
    taskId,
    goal,
    steps: [],
    startedAt: Date.now(),
    status: "running",
  };
}

export function addStep(chain: ProvenanceChain, step: ProvenanceStep): ProvenanceChain {
  return { ...chain, steps: [...chain.steps, step] };
}

export function completeChain(
  chain: ProvenanceChain,
  status: ProvenanceChain["status"]
): ProvenanceChain {
  return { ...chain, status, completedAt: Date.now() };
}

// ─── Persistence ──────────────────────────────────────────────────────────────

export async function persistChain(
  chain: ProvenanceChain,
  userId?: string,
  clientId?: string
): Promise<void> {
  const supabase = getSupabase();

  if (supabase) {
    try {
      await supabase
        .from("provenance_chains")
        .upsert(
          {
            chain_id: chain.taskId,
            data: chain,
            status: chain.status,
            started_at: new Date(chain.startedAt).toISOString(),
            completed_at: chain.completedAt ? new Date(chain.completedAt).toISOString() : null,
            user_id: userId ?? null,
            client_id: clientId ?? null,
          },
          { onConflict: "chain_id" }
        );
      return;
    } catch {
      // fall through to file fallback
    }
  }

  // File fallback
  try {
    const dir = path.join(process.cwd(), "data", "provenance");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, `${chain.taskId}.json`),
      JSON.stringify(chain, null, 2),
      "utf-8"
    );
  } catch {
    // Persistence failure is non-fatal
  }
}

export async function loadChain(taskId: string): Promise<ProvenanceChain | null> {
  const supabase = getSupabase();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("provenance_chains")
        .select("data")
        .eq("chain_id", taskId)
        .single();

      if (!error && data?.data) {
        return data.data as ProvenanceChain;
      }
    } catch {
      // fall through to file fallback
    }
  }

  // File fallback
  try {
    const filePath = path.join(process.cwd(), "data", "provenance", `${taskId}.json`);
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as ProvenanceChain;
  } catch {
    return null;
  }
}
