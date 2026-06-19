import { createHash } from "node:crypto";
import { decrypt, encrypt } from "@/core/security/encryption";

export interface LegacyChatMessage {
  id: string;
  user_id: string;
  role: string;
  content: string;
  display: string;
  expression: string | null;
  created_at: string;
}

export interface StoredMessage extends LegacyChatMessage {
  conversation_id: string;
}

export interface MigrationLedgerEntry {
  legacy_message_id: string;
  user_id: string;
  utc_date: string;
  target_message_id: string;
  target_conversation_id: string;
  message_created_by_backfill: boolean;
  conversation_created_by_backfill: boolean;
  migrated_at?: string;
}

export interface BackfillRepository {
  listLegacyMessages(): Promise<LegacyChatMessage[]>;
  getMessage(id: string): Promise<StoredMessage | null>;
  getConversation(id: string): Promise<{ id: string; user_id: string } | null>;
  getLedgerEntry(legacyMessageId: string): Promise<MigrationLedgerEntry | null>;
  listLedgerEntries(): Promise<MigrationLedgerEntry[]>;
  createConversation(row: {
    id: string;
    user_id: string;
    created_at: string;
    updated_at: string;
  }): Promise<void>;
  insertMessageWithLedger(row: StoredMessage, ledger: MigrationLedgerEntry): Promise<void>;
  insertLedgerEntry(row: MigrationLedgerEntry): Promise<void>;
  refreshConversationStats(id: string, updatedAt: string): Promise<void>;
  deleteMessage(id: string): Promise<void>;
  deleteConversationIfEmpty(id: string): Promise<boolean>;
  deleteLedgerEntry(legacyMessageId: string): Promise<void>;
}

export interface BackfillReport {
  scannedMessages: number;
  plannedMessages: number;
  insertedMessages: number;
  alreadyMigrated: number;
  conflicts: number;
  createdConversations: number;
  deletedMessages: number;
  deletedConversations: number;
  deletedLedgerEntries: number;
}

export interface LegacyMessageGroup {
  userId: string;
  utcDate: string;
  messages: LegacyChatMessage[];
}

export interface BackfillCliOptions {
  apply: boolean;
  rollback: boolean;
}

export function parseBackfillArgs(args: string[]): BackfillCliOptions {
  const values = new Set(args);
  if ([...values].some((arg) => arg !== "--apply" && arg !== "--rollback")) {
    throw new Error("Unknown argument; supported arguments are --apply and --rollback");
  }
  const options = { apply: values.has("--apply"), rollback: values.has("--rollback") };
  if (options.rollback && !options.apply) {
    throw new Error("Rollback requires both --rollback and --apply");
  }
  return options;
}

const CONVERSATION_NAMESPACE = "de15d4e0-a711-5fb0-9c1d-1f387f735f04";

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replaceAll("-", ""), "hex");
}

function bytesToUuid(bytes: Buffer): string {
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function deterministicDailyConversationId(userId: string, utcDate: string): string {
  const digest = createHash("sha1")
    .update(uuidToBytes(CONVERSATION_NAMESPACE))
    .update(`${userId}:${utcDate}`, "utf8")
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  return bytesToUuid(digest);
}

export function groupLegacyMessagesByUtcDay(rows: LegacyChatMessage[]): LegacyMessageGroup[] {
  const groups = new Map<string, LegacyMessageGroup>();
  for (const row of rows) {
    const utcDate = new Date(row.created_at).toISOString().slice(0, 10);
    const key = `${row.user_id}:${utcDate}`;
    const group = groups.get(key) ?? { userId: row.user_id, utcDate, messages: [] };
    group.messages.push(row);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      messages: group.messages.sort(
        (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
      ),
    }))
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate) || a.userId.localeCompare(b.userId));
}

function messageMatches(existing: StoredMessage, legacy: LegacyChatMessage): boolean {
  return (
    existing.id === legacy.id &&
    existing.user_id === legacy.user_id &&
    existing.role === legacy.role &&
    decrypt(existing.content) === legacy.content &&
    decrypt(existing.display) === legacy.display &&
    existing.expression === legacy.expression &&
    new Date(existing.created_at).toISOString() === new Date(legacy.created_at).toISOString()
  );
}

function emptyReport(): BackfillReport {
  return {
    scannedMessages: 0,
    plannedMessages: 0,
    insertedMessages: 0,
    alreadyMigrated: 0,
    conflicts: 0,
    createdConversations: 0,
    deletedMessages: 0,
    deletedConversations: 0,
    deletedLedgerEntries: 0,
  };
}

async function rollback(repo: BackfillRepository, apply: boolean): Promise<BackfillReport> {
  const report = emptyReport();
  const entries = await repo.listLedgerEntries();
  report.scannedMessages = entries.length;
  report.plannedMessages = entries.length;
  if (!apply) return report;

  const conflictedLedgerIds = new Set<string>();
  const conversations = new Map<string, { userId: string; ledgerIds: string[] }>();
  for (const entry of entries) {
    if (entry.message_created_by_backfill) {
      const current = await repo.getMessage(entry.target_message_id);
      if (
        !current ||
        current.id !== entry.target_message_id ||
        current.user_id !== entry.user_id ||
        current.conversation_id !== entry.target_conversation_id
      ) {
        report.conflicts += 1;
        conflictedLedgerIds.add(entry.legacy_message_id);
      } else {
        await repo.deleteMessage(entry.target_message_id);
        report.deletedMessages += 1;
      }
    }
    if (entry.conversation_created_by_backfill) {
      const existing = conversations.get(entry.target_conversation_id);
      if (existing && existing.userId !== entry.user_id) {
        report.conflicts += 1;
        existing.ledgerIds.forEach((id) => conflictedLedgerIds.add(id));
        conflictedLedgerIds.add(entry.legacy_message_id);
      } else if (existing) {
        existing.ledgerIds.push(entry.legacy_message_id);
      } else {
        conversations.set(entry.target_conversation_id, {
          userId: entry.user_id,
          ledgerIds: [entry.legacy_message_id],
        });
      }
    }
  }
  for (const [conversationId, provenance] of conversations) {
    const current = await repo.getConversation(conversationId);
    if (
      !current ||
      current.id !== conversationId ||
      current.user_id !== provenance.userId ||
      !(await repo.deleteConversationIfEmpty(conversationId))
    ) {
      report.conflicts += 1;
      provenance.ledgerIds.forEach((id) => conflictedLedgerIds.add(id));
    } else {
      report.deletedConversations += 1;
    }
  }
  for (const entry of entries) {
    if (conflictedLedgerIds.has(entry.legacy_message_id)) continue;
    await repo.deleteLedgerEntry(entry.legacy_message_id);
    report.deletedLedgerEntries += 1;
  }
  return report;
}

export async function runLegacyChatBackfill(
  repo: BackfillRepository,
  options: { apply?: boolean; rollback?: boolean } = {}
): Promise<BackfillReport> {
  const apply = options.apply === true;
  if (options.rollback) return rollback(repo, apply);

  const rows = await repo.listLegacyMessages();
  const report = emptyReport();
  report.scannedMessages = rows.length;
  report.plannedMessages = rows.length;

  for (const group of groupLegacyMessagesByUtcDay(rows)) {
    const existingById = new Map<string, StoredMessage | null>();
    const matchingConversationIds = new Set<string>();
    for (const legacy of group.messages) {
      const existing = await repo.getMessage(legacy.id);
      existingById.set(legacy.id, existing);
      if (existing && messageMatches(existing, legacy)) {
        matchingConversationIds.add(existing.conversation_id);
      }
    }
    if (matchingConversationIds.size > 1) {
      report.conflicts += group.messages.length;
      continue;
    }
    const conversationId =
      matchingConversationIds.values().next().value ??
      deterministicDailyConversationId(group.userId, group.utcDate);
    const conversation = await repo.getConversation(conversationId);
    if (conversation && conversation.user_id !== group.userId) {
      report.conflicts += group.messages.length;
      continue;
    }
    let conversationCreated = false;

    for (const legacy of group.messages) {
      if (await repo.getLedgerEntry(legacy.id)) {
        report.alreadyMigrated += 1;
        continue;
      }

      const existing = existingById.get(legacy.id) ?? null;
      if (existing && (!messageMatches(existing, legacy) || existing.conversation_id !== conversationId)) {
        report.conflicts += 1;
        continue;
      }
      if (!apply) continue;

      if (!conversation && !conversationCreated) {
        await repo.createConversation({
          id: conversationId,
          user_id: group.userId,
          created_at: group.messages[0].created_at,
          updated_at: group.messages.at(-1)?.created_at ?? group.messages[0].created_at,
        });
        conversationCreated = true;
        report.createdConversations += 1;
      }

      const ledgerEntry: MigrationLedgerEntry = {
        legacy_message_id: legacy.id,
        user_id: group.userId,
        utc_date: group.utcDate,
        target_message_id: legacy.id,
        target_conversation_id: conversationId,
        message_created_by_backfill: !existing,
        conversation_created_by_backfill: conversationCreated,
      };
      if (!existing) {
        const targetMessage = {
          ...legacy,
          conversation_id: conversationId,
          content: encrypt(legacy.content),
          display: encrypt(legacy.display),
        };
        await repo.insertMessageWithLedger(targetMessage, ledgerEntry);
        report.insertedMessages += 1;
      } else {
        await repo.insertLedgerEntry(ledgerEntry);
      }
    }

    if (apply && (conversation || conversationCreated)) {
      await repo.refreshConversationStats(
        conversationId,
        group.messages.at(-1)?.created_at ?? group.messages[0].created_at
      );
    }
  }
  return report;
}
