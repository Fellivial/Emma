import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deterministicDailyConversationId,
  groupLegacyMessagesByUtcDay,
  parseBackfillArgs,
  runLegacyChatBackfill,
  type BackfillRepository,
  type LegacyChatMessage,
  type MigrationLedgerEntry,
  type StoredMessage,
} from "@/core/privacy/legacy-chat-backfill";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function legacy(overrides: Partial<LegacyChatMessage> = {}): LegacyChatMessage {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    user_id: USER_ID,
    role: "user",
    content: "private content",
    display: "private display",
    expression: null,
    created_at: "2026-06-19T23:59:00.000Z",
    ...overrides,
  };
}

function repository(rows: LegacyChatMessage[]) {
  const messages = new Map<string, StoredMessage>();
  const conversations = new Map<string, { id: string; user_id: string }>();
  const ledger = new Map<string, MigrationLedgerEntry>();
  const repo: BackfillRepository = {
    listLegacyMessages: vi.fn().mockResolvedValue(rows),
    getMessage: vi.fn(async (id: string) => messages.get(id) ?? null),
    getConversation: vi.fn(async (id: string) => conversations.get(id) ?? null),
    getLedgerEntry: vi.fn(async (id: string) => ledger.get(id) ?? null),
    listLedgerEntries: vi.fn(async () => [...ledger.values()]),
    createConversation: vi.fn(async (row) => void conversations.set(row.id, row)),
    insertMessageWithLedger: vi.fn(async (row, entry) => {
      messages.set(row.id, row);
      ledger.set(entry.legacy_message_id, entry);
    }),
    insertLedgerEntry: vi.fn(async (row) => void ledger.set(row.legacy_message_id, row)),
    refreshConversationStats: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn(async (id: string) => void messages.delete(id)),
    deleteConversationIfEmpty: vi.fn(async (id: string) => {
      if ([...messages.values()].some((message) => message.conversation_id === id)) return false;
      return conversations.delete(id);
    }),
    deleteLedgerEntry: vi.fn(async (id: string) => void ledger.delete(id)),
  };
  return { repo, messages, conversations, ledger };
}

describe("legacy chat privacy backfill", () => {
  beforeEach(() => {
    vi.stubEnv("EMMA_ENCRYPTION_KEY", "a".repeat(64));
  });

  it("groups one encrypted conversation per user per UTC day in stable order", () => {
    const groups = groupLegacyMessagesByUtcDay([
      legacy({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", created_at: "2026-06-20T00:01:00Z" }),
      legacy(),
      legacy({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", created_at: "2026-06-19T22:00:00Z" }),
    ]);

    expect(groups.map((group) => group.utcDate)).toEqual(["2026-06-19", "2026-06-20"]);
    expect(groups[0].messages.map((message) => message.id)).toEqual([
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ]);
  });

  it("derives deterministic user-and-day conversation UUIDs", () => {
    const first = deterministicDailyConversationId(USER_ID, "2026-06-19");
    expect(first).toBe(deterministicDailyConversationId(USER_ID, "2026-06-19"));
    expect(first).not.toBe(deterministicDailyConversationId(USER_ID, "2026-06-20"));
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("does not write during the default dry run", async () => {
    const { repo } = repository([legacy()]);
    const report = await runLegacyChatBackfill(repo, { apply: false });

    expect(report.plannedMessages).toBe(1);
    expect(repo.createConversation).not.toHaveBeenCalled();
    expect(repo.insertMessageWithLedger).not.toHaveBeenCalled();
    expect(repo.insertLedgerEntry).not.toHaveBeenCalled();
  });

  it("parses the CLI as dry-run by default and rejects rollback without apply", () => {
    expect(parseBackfillArgs([])).toEqual({ apply: false, rollback: false });
    expect(parseBackfillArgs(["--rollback", "--apply"])).toEqual({
      apply: true,
      rollback: true,
    });
    expect(() => parseBackfillArgs(["--rollback"])).toThrow(
      "Rollback requires both --rollback and --apply"
    );
  });

  it("is idempotent and never duplicates applied messages", async () => {
    const { repo, messages, ledger } = repository([legacy()]);
    const first = await runLegacyChatBackfill(repo, { apply: true });
    const second = await runLegacyChatBackfill(repo, { apply: true });

    expect(first.insertedMessages).toBe(1);
    expect(second.insertedMessages).toBe(0);
    expect(second.alreadyMigrated).toBe(1);
    expect(messages.size).toBe(1);
    expect(ledger.size).toBe(1);
  });

  it("does not overwrite a conflicting encrypted message", async () => {
    const { repo, messages } = repository([legacy()]);
    messages.set("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      conversation_id: "22222222-2222-4222-8222-222222222222",
      user_id: USER_ID,
      role: "assistant",
      content: "different",
      display: "different",
      expression: null,
      created_at: "2026-06-19T23:59:00.000Z",
    });

    const report = await runLegacyChatBackfill(repo, { apply: true });
    expect(report.conflicts).toBe(1);
    expect(repo.insertMessageWithLedger).not.toHaveBeenCalled();
    expect(repo.insertLedgerEntry).not.toHaveBeenCalled();
  });

  it("reuses the one matching encrypted conversation already associated with the UTC day", async () => {
    const existingConversationId = "22222222-2222-4222-8222-222222222222";
    const { repo, messages, conversations, ledger } = repository([legacy()]);
    conversations.set(existingConversationId, { id: existingConversationId, user_id: USER_ID });
    messages.set("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
      ...legacy(),
      conversation_id: existingConversationId,
    });

    const report = await runLegacyChatBackfill(repo, { apply: true });
    expect(report.conflicts).toBe(0);
    expect(repo.createConversation).not.toHaveBeenCalled();
    expect(ledger.get("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toMatchObject({
      target_conversation_id: existingConversationId,
      message_created_by_backfill: false,
      conversation_created_by_backfill: false,
    });
  });

  it("rollback deletes only rows proven by the ledger to be backfill-created", async () => {
    const { repo, messages, conversations } = repository([legacy()]);
    await runLegacyChatBackfill(repo, { apply: true });
    const conversationId = deterministicDailyConversationId(USER_ID, "2026-06-19");

    const report = await runLegacyChatBackfill(repo, { apply: true, rollback: true });
    expect(report.deletedMessages).toBe(1);
    expect(messages.size).toBe(0);
    expect(conversations.has(conversationId)).toBe(false);
  });

  it("rollback preserves pre-existing messages not created by the backfill", async () => {
    const existingConversationId = "22222222-2222-4222-8222-222222222222";
    const { repo, messages, conversations } = repository([legacy()]);
    conversations.set(existingConversationId, { id: existingConversationId, user_id: USER_ID });
    messages.set(legacy().id, { ...legacy(), conversation_id: existingConversationId });
    await runLegacyChatBackfill(repo, { apply: true });

    const report = await runLegacyChatBackfill(repo, { apply: true, rollback: true });
    expect(report.deletedMessages).toBe(0);
    expect(report.conflicts).toBe(0);
    expect(messages.has(legacy().id)).toBe(true);
  });

  it("rollback preserves a replaced message whose user no longer matches the ledger", async () => {
    const { repo, messages, ledger } = repository([legacy()]);
    await runLegacyChatBackfill(repo, { apply: true });
    messages.set(legacy().id, {
      ...messages.get(legacy().id)!,
      user_id: "33333333-3333-4333-8333-333333333333",
    });

    const report = await runLegacyChatBackfill(repo, { apply: true, rollback: true });
    expect(report.conflicts).toBeGreaterThan(0);
    expect(messages.has(legacy().id)).toBe(true);
    expect(ledger.has(legacy().id)).toBe(true);
  });

  it("rollback preserves a replaced message whose conversation no longer matches the ledger", async () => {
    const { repo, messages, ledger } = repository([legacy()]);
    await runLegacyChatBackfill(repo, { apply: true });
    messages.set(legacy().id, {
      ...messages.get(legacy().id)!,
      conversation_id: "44444444-4444-4444-8444-444444444444",
    });

    const report = await runLegacyChatBackfill(repo, { apply: true, rollback: true });
    expect(report.conflicts).toBeGreaterThan(0);
    expect(messages.has(legacy().id)).toBe(true);
    expect(ledger.has(legacy().id)).toBe(true);
  });

  it("rollback preserves a conversation whose current owner does not match the ledger", async () => {
    const { repo, conversations, ledger } = repository([legacy()]);
    await runLegacyChatBackfill(repo, { apply: true });
    const conversationId = deterministicDailyConversationId(USER_ID, "2026-06-19");
    conversations.set(conversationId, {
      id: conversationId,
      user_id: "55555555-5555-4555-8555-555555555555",
    });

    const report = await runLegacyChatBackfill(repo, { apply: true, rollback: true });
    expect(report.conflicts).toBeGreaterThan(0);
    expect(conversations.has(conversationId)).toBe(true);
    expect(ledger.has(legacy().id)).toBe(true);
  });
});
