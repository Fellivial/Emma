/**
 * Memory DB — Supabase PostgreSQL storage.
 * Server-side only (API routes).
 *
 * Falls back gracefully if Supabase is not configured — returns empty arrays.
 */

import { createClient } from "@supabase/supabase-js";
import type { MemoryEntry, MemoryCategory } from "@/types/emma";
import { encrypt, decrypt } from "@/core/security/encryption";
import { audit } from "@/core/security/audit";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  return createClient(url, key);
}

// ─── Read ────────────────────────────────────────────────────────────────────

export async function getMemoriesForUser(
  userId: string,
  category?: MemoryCategory
): Promise<MemoryEntry[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  let query = supabase
    .from("memories")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[Memory DB] Read error:", error.message);
    return [];
  }

  return (data || []).map(rowToMemoryEntry);
}

// ─── Write ───────────────────────────────────────────────────────────────────

export async function addMemoryForUser(
  userId: string,
  entry: Omit<MemoryEntry, "id" | "timestamp"> & { id?: string }
): Promise<MemoryEntry | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const id = entry.id || `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const { data, error } = await supabase
    .from("memories")
    .upsert(
      {
        id,
        user_id: userId,
        category: entry.category,
        key: entry.key,
        value: encrypt(entry.value),
        confidence: entry.confidence ?? 0.8,
        source: entry.source || "extracted",
      },
      { onConflict: "user_id,category,key" }
    )
    .select()
    .single();

  if (error) {
    console.error("[Memory DB] Write error:", error.message);
    return null;
  }

  if (data) {
    audit({ userId, action: "write", resource: "memory", resourceId: id, reason: `Store ${entry.category}:${entry.key}` }).catch(() => {});
  }

  return data ? rowToMemoryEntry(data) : null;
}

export async function addMemoriesForUser(
  userId: string,
  entries: Array<Omit<MemoryEntry, "id" | "timestamp"> & { id?: string }>
): Promise<MemoryEntry[]> {
  const results: MemoryEntry[] = [];
  for (const entry of entries) {
    const result = await addMemoryForUser(userId, entry);
    if (result) results.push(result);
  }
  return results;
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export async function deleteMemoryForUser(userId: string, memoryId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { error } = await supabase
    .from("memories")
    .delete()
    .eq("id", memoryId)
    .eq("user_id", userId);

  if (error) {
    console.error("[Memory DB] Delete error:", error.message);
    return false;
  }

  audit({ userId, action: "delete", resource: "memory", resourceId: memoryId, reason: "User-initiated memory deletion" }).catch(() => {});
  return true;
}

// ─── Usage Tracking ──────────────────────────────────────────────────────────

export async function incrementUsage(
  userId: string,
  messages: number = 1,
  tokens: number = 0
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const today = new Date().toISOString().split("T")[0];

  // Upsert — increment on conflict
  const { error } = await supabase.rpc("increment_usage", {
    p_user_id: userId,
    p_date: today,
    p_messages: messages,
    p_tokens: tokens,
  });

  // If RPC doesn't exist yet, fall back to manual upsert
  if (error) {
    await supabase
      .from("usage")
      .upsert(
        {
          user_id: userId,
          date: today,
          message_count: messages,
          token_count: tokens,
          api_calls: 1,
        },
        { onConflict: "user_id,date" }
      );
  }
}

// ─── Conversation Persistence ────────────────────────────────────────────────

export async function getOrCreateConversation(userId: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  // Get most recent conversation from today
  const today = new Date().toISOString().split("T")[0];
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .gte("created_at", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (existing) return existing.id;

  // Create new
  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId })
    .select("id")
    .single();

  if (error || !created) return null;
  return created.id;
}

export async function saveMessage(
  conversationId: string,
  userId: string,
  msg: { id: string; role: string; content: string; display: string; expression?: string; tokenEstimate?: number }
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  await supabase.from("messages").insert({
    id: msg.id,
    conversation_id: conversationId,
    user_id: userId,
    role: msg.role,
    content: encrypt(msg.content),
    display: encrypt(msg.display),
    expression: msg.expression,
    token_estimate: msg.tokenEstimate || 0,
  });

  // Update conversation message count (non-critical)
  try {
    await supabase.rpc("increment_conversation_count", {
      p_conversation_id: conversationId,
    });
  } catch {
    // RPC might not exist
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowToMemoryEntry(row: any): MemoryEntry {
  return {
    id: row.id,
    timestamp: new Date(row.created_at).getTime(),
    category: row.category,
    key: row.key,
    value: decrypt(row.value),
    confidence: row.confidence,
    source: row.source,
    lastAccessed: row.last_accessed ? new Date(row.last_accessed).getTime() : undefined,
    userId: row.user_id,
  };
}
