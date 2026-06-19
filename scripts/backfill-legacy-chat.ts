/**
 * Manual, service-role-only legacy chat encryption backfill.
 *
 * Dry run:  npx tsx scripts/backfill-legacy-chat.ts
 * Apply:    npx tsx scripts/backfill-legacy-chat.ts --apply
 * Rollback: npx tsx scripts/backfill-legacy-chat.ts --rollback --apply
 *
 * Output is aggregate counts only. Never add message content to this script's logs.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertEncryptionConfigured } from "../src/core/security/encryption";
import {
  runLegacyChatBackfill,
  parseBackfillArgs,
  type BackfillRepository,
  type LegacyChatMessage,
  type MigrationLedgerEntry,
  type StoredMessage,
} from "../src/core/privacy/legacy-chat-backfill";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function repository(supabase: SupabaseClient): BackfillRepository {
  return {
    async listLegacyMessages() {
      const rows: LegacyChatMessage[] = [];
      const pageSize = 500;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("chat_messages")
          .select("id, user_id, role, content, display, expression, created_at")
          .order("user_id", { ascending: true })
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        rows.push(...((data ?? []) as LegacyChatMessage[]));
        if ((data?.length ?? 0) < pageSize) break;
      }
      return rows;
    },
    async getMessage(id) {
      const { data, error } = await supabase.from("messages").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as StoredMessage | null;
    },
    async getConversation(id) {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, user_id")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; user_id: string } | null;
    },
    async getLedgerEntry(id) {
      const { data, error } = await supabase
        .from("legacy_chat_migration_ledger")
        .select("*")
        .eq("legacy_message_id", id)
        .maybeSingle();
      if (error) throw error;
      return data as MigrationLedgerEntry | null;
    },
    async listLedgerEntries() {
      const rows: MigrationLedgerEntry[] = [];
      const pageSize = 500;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("legacy_chat_migration_ledger")
          .select("*")
          .order("migrated_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        rows.push(...((data ?? []) as MigrationLedgerEntry[]));
        if ((data?.length ?? 0) < pageSize) break;
      }
      return rows;
    },
    async createConversation(row) {
      const { error } = await supabase.from("conversations").insert({ ...row, message_count: 0 });
      if (error) throw error;
    },
    async insertMessageWithLedger(row, ledger) {
      const { error } = await supabase.rpc("backfill_legacy_chat_message", {
        p_message: row,
        p_ledger: ledger,
      });
      if (error) throw error;
    },
    async insertLedgerEntry(row) {
      const { error } = await supabase.from("legacy_chat_migration_ledger").insert(row);
      if (error) throw error;
    },
    async refreshConversationStats(id, updatedAt) {
      const { count, error: countError } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", id);
      if (countError) throw countError;
      const { error } = await supabase
        .from("conversations")
        .update({ message_count: count ?? 0, updated_at: updatedAt })
        .eq("id", id);
      if (error) throw error;
    },
    async deleteMessage(id) {
      const { error } = await supabase.from("messages").delete().eq("id", id);
      if (error) throw error;
    },
    async deleteConversationIfEmpty(id) {
      const { count, error: countError } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", id);
      if (countError) throw countError;
      if ((count ?? 0) !== 0) return false;
      const { error } = await supabase.from("conversations").delete().eq("id", id);
      if (error) throw error;
      return true;
    },
    async deleteLedgerEntry(id) {
      const { error } = await supabase
        .from("legacy_chat_migration_ledger")
        .delete()
        .eq("legacy_message_id", id);
      if (error) throw error;
    },
  };
}

async function main() {
  const { apply, rollback } = parseBackfillArgs(process.argv.slice(2));
  // Dry-run also compares legacy plaintext with existing encrypted rows, so a
  // valid key is required for an accurate and safe report in every mode.
  assertEncryptionConfigured();

  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const report = await runLegacyChatBackfill(repository(supabase), { apply, rollback });
  console.info(JSON.stringify({ mode: rollback ? "rollback" : apply ? "apply" : "dry-run", ...report }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Legacy chat backfill failed");
  process.exitCode = 1;
});
