/**
 * Field-Level Encryption — AES-256-GCM
 *
 * Supabase encrypts at the disk level, but that only protects against
 * physical access. Field-level encryption protects against:
 *   - DB admin reading memory values
 *   - SQL injection leaking plaintext
 *   - Backup files containing readable PII
 *
 * Usage:
 *   encrypt("user likes lo-fi music") → "enc:v1:iv:ciphertext:tag"
 *   decrypt("enc:v1:iv:ciphertext:tag") → "user likes lo-fi music"
 *
 * Key: EMMA_ENCRYPTION_KEY env var (32-byte hex = 64 chars).
 * Generate with: openssl rand -hex 32
 *
 * Key rotation: set the new key as EMMA_ENCRYPTION_KEY and the old key as
 * EMMA_ENCRYPTION_KEY_PREVIOUS. Writes use the new key; reads fall back to
 * the previous key for ciphertext not yet migrated. Run
 * scripts/rotate-encryption-key.ts to re-encrypt stored data, then remove
 * EMMA_ENCRYPTION_KEY_PREVIOUS. See docs/runbook-encryption-key-escrow.md.
 */

import * as crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const PREFIX = "enc:v1:";

const KEY_HEX_PATTERN = /^[0-9a-fA-F]{64}$/;

function keyFromHex(hex: string | undefined): Buffer | null {
  if (!hex || !KEY_HEX_PATTERN.test(hex)) return null;
  return Buffer.from(hex, "hex");
}

function getKey(): Buffer | null {
  return keyFromHex(process.env.EMMA_ENCRYPTION_KEY);
}

/** Previous key, present only during a rotation window. Never used for writes. */
function getPreviousKey(): Buffer | null {
  return keyFromHex(process.env.EMMA_ENCRYPTION_KEY_PREVIOUS);
}

export class EncryptionConfigurationError extends Error {
  constructor() {
    super("EMMA_ENCRYPTION_KEY must be configured as exactly 64 hexadecimal characters");
    this.name = "EncryptionConfigurationError";
  }
}

/**
 * Encrypt a plaintext string.
 * Returns prefixed ciphertext: "enc:v1:<iv_hex>:<ciphertext_hex>:<tag_hex>"
 * Returns plaintext unchanged if encryption key is not configured.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new EncryptionConfigurationError();
    }
    // Warn once per process start — not per call (avoid log spam)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(globalThis as any).__emmaEncryptionWarned) {
      console.warn(
        "[EMMA] WARNING: EMMA_ENCRYPTION_KEY is not set. " +
          "Memory values and sensitive data are stored as PLAINTEXT. " +
          "Set this env var before handling real user data. " +
          "Generate with: openssl rand -hex 32"
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).__emmaEncryptionWarned = true;
    }
    return plaintext;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString("hex")}:${encrypted}:${tag.toString("hex")}`;
}

/**
 * Decrypt an encrypted string.
 * If the string doesn't have the "enc:v1:" prefix, returns it as-is
 * (backward compat with pre-encryption data).
 */
export function decrypt(ciphertext: string | null | undefined): string {
  if (!ciphertext) return "";
  if (!ciphertext.startsWith(PREFIX)) return ciphertext; // Not encrypted

  const key = getKey();
  if (!key) {
    console.warn("[Encryption] Cannot decrypt: EMMA_ENCRYPTION_KEY not set");
    return "[encrypted — key missing]";
  }

  const parts = ciphertext.slice(PREFIX.length).split(":");
  if (parts.length !== 3) return "[malformed encrypted data]";

  const primary = tryDecryptParts(parts, key);
  if (primary !== null) return primary;

  // Rotation window: ciphertext may still be encrypted with the previous key.
  const previousKey = getPreviousKey();
  if (previousKey) {
    const fallback = tryDecryptParts(parts, previousKey);
    if (fallback !== null) return fallback;
  }

  console.error("[Encryption] Decrypt failed: ciphertext does not match any configured key");
  return "[decryption failed]";
}

/** Attempt GCM decryption with one key; null on auth/format failure. */
function tryDecryptParts(parts: string[], key: Buffer): string | null {
  try {
    const [ivHex, encHex, tagHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const encrypted = Buffer.from(encHex, "hex");
    const tag = Buffer.from(tagHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Encrypt with an explicit key (hex). Used by the key-rotation script;
 * application code should use encrypt(), which reads the env key.
 */
export function encryptWithKeyHex(plaintext: string, keyHex: string): string {
  const key = keyFromHex(keyHex);
  if (!key) throw new EncryptionConfigurationError();

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString("hex")}:${encrypted}:${tag.toString("hex")}`;
}

/**
 * Decrypt with an explicit key (hex). Returns null when the value is not
 * decryptable with that key (wrong key, malformed, or not encrypted).
 * Used by the key-rotation script.
 */
export function decryptWithKeyHex(ciphertext: string, keyHex: string): string | null {
  if (!ciphertext.startsWith(PREFIX)) return null;
  const key = keyFromHex(keyHex);
  if (!key) throw new EncryptionConfigurationError();

  const parts = ciphertext.slice(PREFIX.length).split(":");
  if (parts.length !== 3) return null;
  return tryDecryptParts(parts, key);
}

/** True when a value carries the field-encryption prefix. */
export function isEncryptedValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/**
 * Check if encryption is configured.
 */
export function isEncryptionEnabled(): boolean {
  return getKey() !== null;
}

export function assertEncryptionConfigured(): void {
  if (!getKey()) throw new EncryptionConfigurationError();
}

/**
 * Encrypt an object's sensitive fields in-place.
 * Only encrypts string values for specified keys.
 */
export function encryptFields<T extends Record<string, unknown>>(obj: T, fields: string[]): T {
  const result = { ...obj };
  for (const field of fields) {
    if (typeof result[field] === "string") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result as any)[field] = encrypt(result[field] as string);
    }
  }
  return result;
}

/**
 * Decrypt an object's sensitive fields in-place.
 */
export function decryptFields<T extends Record<string, unknown>>(obj: T, fields: string[]): T {
  const result = { ...obj };
  for (const field of fields) {
    if (typeof result[field] === "string") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result as any)[field] = decrypt(result[field] as string);
    }
  }
  return result;
}
