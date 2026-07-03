/**
 * rotate-encryption-key.ts — Re-encrypt all field-encrypted data with a new key.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=...       # target project (staging first!)
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *   EMMA_ENCRYPTION_KEY_OLD=<current 64-hex key>
 *   EMMA_ENCRYPTION_KEY_NEW=<new 64-hex key>
 *   npx tsx scripts/rotate-encryption-key.ts [--execute]
 *
 * Default mode is a DRY RUN: it counts and verifies every row but writes
 * nothing. Pass --execute to write re-encrypted values.
 *
 * Safety properties:
 *   - Only values with the "enc:v1:" prefix are touched; plaintext rows are skipped.
 *   - Values already decryptable with the NEW key are skipped (idempotent —
 *     the script can be re-run after a partial failure).
 *   - Every new ciphertext is verified to decrypt back to the original
 *     plaintext with the NEW key before it is written.
 *   - Values that decrypt with NEITHER key are reported and left untouched.
 *
 * Full procedure (dual-key rotation, zero downtime):
 *   see docs/runbook-encryption-key-escrow.md → "Key Rotation Plan".
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  encryptWithKeyHex,
  decryptWithKeyHex,
  isEncryptedValue,
} from "../src/core/security/encryption";

const BATCH_SIZE = 500;

interface EncryptedColumnSpec {
  table: string;
  idColumn: string;
  columns: string[];
}

// Every field-encrypted column in the schema. Keep in sync with encrypt()
// call sites (grep for "encrypt(" under src/).
const ENCRYPTED_COLUMNS: EncryptedColumnSpec[] = [
  { table: "client_integrations", idColumn: "id", columns: ["access_token", "refresh_token"] },
  { table: "memories", idColumn: "id", columns: ["value"] },
  { table: "messages", idColumn: "id", columns: ["content", "display"] },
  { table: "chat_messages", idColumn: "id", columns: ["content", "display"] },
  { table: "conversations", idColumn: "id", columns: ["title", "summary"] },
  { table: "personas", idColumn: "id", columns: ["voice_id", "description"] },
];

interface Stats {
  scanned: number;
  reEncrypted: number;
  alreadyNewKey: number;
  notEncrypted: number;
  undecryptable: number;
  writeErrors: number;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

function requireKey(name: string): string {
  const value = requireEnv(name);
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    console.error(`${name} must be exactly 64 hexadecimal characters`);
    process.exit(1);
  }
  return value;
}

async function rotateTable(
  supabase: SupabaseClient,
  spec: EncryptedColumnSpec,
  oldKey: string,
  newKey: string,
  execute: boolean
): Promise<Stats> {
  const stats: Stats = {
    scanned: 0,
    reEncrypted: 0,
    alreadyNewKey: 0,
    notEncrypted: 0,
    undecryptable: 0,
    writeErrors: 0,
  };

  const selectCols = [spec.idColumn, ...spec.columns].join(",");
  let offset = 0;

  for (;;) {
    const { data: rows, error } = await supabase
      .from(spec.table)
      .select(selectCols)
      .order(spec.idColumn, { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error(`  [${spec.table}] read error at offset ${offset}: ${error.message}`);
      stats.writeErrors += 1;
      break;
    }
    if (!rows || rows.length === 0) break;

    for (const row of rows as unknown as Array<Record<string, unknown>>) {
      stats.scanned += 1;
      const update: Record<string, string> = {};

      for (const column of spec.columns) {
        const value = row[column];
        if (typeof value !== "string" || !value) continue;

        if (!isEncryptedValue(value)) {
          stats.notEncrypted += 1;
          continue;
        }

        // Idempotency: skip values already on the new key.
        if (decryptWithKeyHex(value, newKey) !== null) {
          stats.alreadyNewKey += 1;
          continue;
        }

        const plaintext = decryptWithKeyHex(value, oldKey);
        if (plaintext === null) {
          stats.undecryptable += 1;
          console.error(
            `  [${spec.table}] ${spec.idColumn}=${String(row[spec.idColumn])} ` +
              `column=${column}: not decryptable with OLD or NEW key — left untouched`
          );
          continue;
        }

        const reEncrypted = encryptWithKeyHex(plaintext, newKey);
        // Verify round-trip with the new key before writing.
        if (decryptWithKeyHex(reEncrypted, newKey) !== plaintext) {
          stats.undecryptable += 1;
          console.error(
            `  [${spec.table}] ${spec.idColumn}=${String(row[spec.idColumn])} ` +
              `column=${column}: round-trip verification failed — left untouched`
          );
          continue;
        }

        update[column] = reEncrypted;
      }

      if (Object.keys(update).length > 0) {
        if (execute) {
          const { error: writeError } = await supabase
            .from(spec.table)
            .update(update)
            .eq(spec.idColumn, row[spec.idColumn]);
          if (writeError) {
            stats.writeErrors += 1;
            console.error(
              `  [${spec.table}] ${spec.idColumn}=${String(row[spec.idColumn])} ` +
                `write error: ${writeError.message}`
            );
            continue;
          }
        }
        stats.reEncrypted += Object.keys(update).length;
      }
    }

    if (rows.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  return stats;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const oldKey = requireKey("EMMA_ENCRYPTION_KEY_OLD");
  const newKey = requireKey("EMMA_ENCRYPTION_KEY_NEW");

  if (oldKey.toLowerCase() === newKey.toLowerCase()) {
    console.error("EMMA_ENCRYPTION_KEY_OLD and EMMA_ENCRYPTION_KEY_NEW must differ");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey);

  console.log(
    `Encryption key rotation — ${execute ? "EXECUTE" : "DRY RUN (pass --execute to write)"}`
  );
  console.log(`Target: ${url}`);
  console.log("Keys: redacted\n");

  let totalUndecryptable = 0;
  let totalWriteErrors = 0;

  for (const spec of ENCRYPTED_COLUMNS) {
    console.log(`Table: ${spec.table} (${spec.columns.join(", ")})`);
    const stats = await rotateTable(supabase, spec, oldKey, newKey, execute);
    console.log(
      `  scanned=${stats.scanned} reEncrypted=${stats.reEncrypted} ` +
        `alreadyNewKey=${stats.alreadyNewKey} plaintextSkipped=${stats.notEncrypted} ` +
        `undecryptable=${stats.undecryptable} writeErrors=${stats.writeErrors}`
    );
    totalUndecryptable += stats.undecryptable;
    totalWriteErrors += stats.writeErrors;
  }

  console.log("");
  if (totalUndecryptable > 0 || totalWriteErrors > 0) {
    console.error(
      `FAIL: ${totalUndecryptable} undecryptable value(s), ${totalWriteErrors} write error(s). ` +
        "No data was destroyed — affected values were left untouched. " +
        "Investigate before removing EMMA_ENCRYPTION_KEY_PREVIOUS."
    );
    process.exit(1);
  }

  console.log(
    execute
      ? "PASS: all encrypted values are now on the new key. " +
          "After deploying the new EMMA_ENCRYPTION_KEY, remove EMMA_ENCRYPTION_KEY_PREVIOUS."
      : "PASS (dry run): all encrypted values can be migrated. Re-run with --execute to write."
  );
}

main().catch((err) => {
  console.error("Rotation failed with an unexpected error:", err);
  process.exit(1);
});
