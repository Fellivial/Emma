/**
 * Memory DB â€" Supabase PostgreSQL storage.
 * Server-side only (API routes).
 *
 * Falls back gracefully if Supabase is not configured â€" returns empty arrays.
 */

import { createClient } from "@supabase/supabase-js";
import type { MemoryEntry, MemoryCategory } from "@/types/emma";
import { encrypt, decrypt } from "@/core/security/encryption";
import { audit } from "@/core/security/audit";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;
  return createClient(url, key);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "my",
  "your",
  "our",
  "their",
  "his",
  "her",
  "its",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "i",
  "me",
  "we",
  "you",
  "he",
  "she",
  "it",
  "they",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
]);

// Normalize a memory key: lowercase, strip stop words, snake_case, max 60 chars
function normalizeKey(raw: string): string {
  const words = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
  const normalized = words
    .join("_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return (
    normalized ||
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .slice(0, 60)
  );
}

// â"€â"€â"€ Read â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export async function getMemoriesForUser(
  userId: string,
  category?: MemoryCategory
): Promise<MemoryEntry[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  if (!isUuid(userId)) return [];

  let query = supabase
    .from("memories")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
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

// â"€â"€â"€ Write â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export async function addMemoryForUser(
  userId: string,
  entry: Omit<MemoryEntry, "id" | "timestamp"> & { id?: string }
): Promise<MemoryEntry | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const normalizedKey = normalizeKey(entry.key);
  const newId = entry.id || `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const encryptedValue = encrypt(entry.value);

  // Check for an existing active memory with the same key
  const { data: existing } = await supabase
    .from("memories")
    .select("id, value")
    .eq("user_id", userId)
    .eq("category", entry.category)
    .eq("key", normalizedKey)
    .eq("status", "active")
    .single();

  if (existing) {
    const currentDecrypted = decrypt(existing.value as string);
    if (currentDecrypted === entry.value) {
      // Value unchanged — update confidence if provided, return existing
      await supabase
        .from("memories")
        .update({ confidence: entry.confidence ?? 0.8, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      const { data: updated } = await supabase
        .from("memories")
        .select("*")
        .eq("id", existing.id)
        .single();
      return updated ? rowToMemoryEntry(updated) : null;
    }
    // Value changed — soft-delete the old entry before inserting the new one
    await supabase
      .from("memories")
      .update({ status: "superseded", superseded_by: newId, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  }

  const { data, error } = await supabase
    .from("memories")
    .insert({
      id: newId,
      user_id: userId,
      category: entry.category,
      key: normalizedKey,
      value: encryptedValue,
      confidence: entry.confidence ?? 0.8,
      source: entry.source || "extracted",
      status: "active",
    })
    .select()
    .single();

  if (error) {
    console.error("[Memory DB] Write error:", error.message);
    return null;
  }

  if (data) {
    audit({
      userId,
      action: "write",
      resource: "memory",
      resourceId: newId,
      reason: `Store ${entry.category}:${normalizedKey}`,
    }).catch(() => {});
  }

  return data ? rowToMemoryEntry(data) : null;
}

export async function addMemoriesForUser(
  userId: string,
  entries: Array<Omit<MemoryEntry, "id" | "timestamp"> & { id?: string }>
): Promise<MemoryEntry[]> {
  const results = await Promise.all(entries.map((entry) => addMemoryForUser(userId, entry)));
  return results.filter((r): r is MemoryEntry => r !== null);
}

// â"€â"€â"€ Delete â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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

  audit({
    userId,
    action: "delete",
    resource: "memory",
    resourceId: memoryId,
    reason: "User-initiated memory deletion",
  }).catch(() => {});
  return true;
}

// â"€â"€â"€ Usage Tracking â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export async function incrementUsage(
  userId: string,
  messages: number = 1,
  tokens: number = 0
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const today = new Date().toISOString().split("T")[0];

  // Upsert â€" increment on conflict
  const { error } = await supabase.rpc("increment_usage", {
    p_user_id: userId,
    p_date: today,
    p_messages: messages,
    p_tokens: tokens,
  });

  if (error) {
    console.error("[memory-db] incrementUsage RPC failed:", error);
  }
}

// â"€â"€â"€ Conversation Persistence â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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
  msg: {
    id: string;
    role: string;
    content: string;
    display: string;
    expression?: string;
    tokenEstimate?: number;
  }
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

// ─── Conversation Summary + Title ───────────────────────────────────────────

export async function getLatestConversationSummary(userId: string): Promise<{
  id: string;
  summary: string | null;
  title: string | null;
  messageCount: number;
} | null> {
  const supabase = getSupabase();
  if (!supabase || !isUuid(userId)) return null;

  const { data } = await supabase
    .from("conversations")
    .select("id, summary, title, message_count")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!data) return null;
  return {
    id: data.id as string,
    summary: (data.summary as string | null) ?? null,
    title: (data.title as string | null) ?? null,
    messageCount: (data.message_count as number) ?? 0,
  };
}

export async function updateConversationSummary(
  conversationId: string,
  summary: string
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase
    .from("conversations")
    .update({ summary, updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}

export async function updateConversationTitle(
  conversationId: string,
  title: string
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase
    .from("conversations")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}

export async function getConversationMessages(
  conversationId: string,
  limit = 50
): Promise<Array<{ role: string; content: string; display: string; createdAt: string }>> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data } = await supabase
    .from("messages")
    .select("role, content, display, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  return (data || []).map((row) => ({
    role: row.role as string,
    content: decrypt(row.content as string),
    display: decrypt(row.display as string),
    createdAt: row.created_at as string,
  }));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowToMemoryEntry(row: Record<string, unknown>): MemoryEntry {
  return {
    id: row.id as string,
    timestamp: new Date(row.created_at as string).getTime(),
    category: row.category as MemoryCategory,
    key: row.key as string,
    value: decrypt(row.value as string),
    confidence: row.confidence as number,
    source: row.source as "extracted" | "explicit" | "observed",
    lastAccessed: row.last_accessed ? new Date(row.last_accessed as string).getTime() : undefined,
    userId: row.user_id as string,
  };
}
