/**
 * Server-only memory store — uses fs for persistence.
 * Only import this in API routes (app/api/**).
 */

import { promises as fs } from "fs";
import path from "path";
import type { MemoryEntry, MemoryStore, MemoryCategory } from "@/types/emma";

// Re-export shared utilities so API routes have a single import
export { serializeMemories, MEMORY_EXTRACTION_PROMPT } from "./memory-shared";

const MEMORY_FILE = path.join(process.cwd(), "data", "memory.json");

async function ensureDataDir() {
  const dir = path.dirname(MEMORY_FILE);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

export async function loadMemory(): Promise<MemoryStore> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(MEMORY_FILE, "utf-8");
    return JSON.parse(raw) as MemoryStore;
  } catch {
    const empty: MemoryStore = { entries: [], lastUpdated: Date.now() };
    await saveMemory(empty);
    return empty;
  }
}

export async function saveMemory(store: MemoryStore): Promise<void> {
  await ensureDataDir();
  store.lastUpdated = Date.now();
  await fs.writeFile(MEMORY_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export async function getMemories(category?: MemoryCategory): Promise<MemoryEntry[]> {
  const store = await loadMemory();
  if (category) {
    return store.entries.filter((e) => e.category === category);
  }
  return store.entries;
}

export async function addMemory(entry: MemoryEntry): Promise<MemoryEntry> {
  const store = await loadMemory();
  const existingIdx = store.entries.findIndex(
    (e) => e.key === entry.key && e.category === entry.category
  );
  if (existingIdx >= 0) {
    store.entries[existingIdx] = { ...store.entries[existingIdx], ...entry, timestamp: Date.now() };
  } else {
    store.entries.push(entry);
  }
  await saveMemory(store);
  return entry;
}

export async function addMemories(entries: MemoryEntry[]): Promise<MemoryEntry[]> {
  const store = await loadMemory();
  for (const entry of entries) {
    const existingIdx = store.entries.findIndex(
      (e) => e.key === entry.key && e.category === entry.category
    );
    if (existingIdx >= 0) {
      store.entries[existingIdx] = {
        ...store.entries[existingIdx],
        ...entry,
        timestamp: Date.now(),
      };
    } else {
      store.entries.push(entry);
    }
  }
  await saveMemory(store);
  return entries;
}

export async function deleteMemory(id: string): Promise<boolean> {
  const store = await loadMemory();
  const before = store.entries.length;
  store.entries = store.entries.filter((e) => e.id !== id);
  if (store.entries.length < before) {
    await saveMemory(store);
    return true;
  }
  return false;
}
