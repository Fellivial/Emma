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
 */

import * as crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const PREFIX = "enc:v1:";

function getKey(): Buffer | null {
  const hex = process.env.EMMA_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) return null;
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt a plaintext string.
 * Returns prefixed ciphertext: "enc:v1:<iv_hex>:<ciphertext_hex>:<tag_hex>"
 * Returns plaintext unchanged if encryption key is not configured.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext; // Graceful fallback — no key = no encryption

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
export function decrypt(ciphertext: string): string {
  if (!ciphertext.startsWith(PREFIX)) return ciphertext; // Not encrypted

  const key = getKey();
  if (!key) {
    console.warn("[Encryption] Cannot decrypt: EMMA_ENCRYPTION_KEY not set");
    return "[encrypted — key missing]";
  }

  try {
    const parts = ciphertext.slice(PREFIX.length).split(":");
    if (parts.length !== 3) return "[malformed encrypted data]";

    const [ivHex, encHex, tagHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const encrypted = Buffer.from(encHex, "hex");
    const tag = Buffer.from(tagHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString("utf8");
  } catch (err) {
    console.error("[Encryption] Decrypt failed:", err);
    return "[decryption failed]";
  }
}

/**
 * Check if encryption is configured.
 */
export function isEncryptionEnabled(): boolean {
  return getKey() !== null;
}

/**
 * Encrypt an object's sensitive fields in-place.
 * Only encrypts string values for specified keys.
 */
export function encryptFields<T extends Record<string, unknown>>(
  obj: T,
  fields: string[]
): T {
  const result = { ...obj };
  for (const field of fields) {
    if (typeof result[field] === "string") {
      (result as any)[field] = encrypt(result[field] as string);
    }
  }
  return result;
}

/**
 * Decrypt an object's sensitive fields in-place.
 */
export function decryptFields<T extends Record<string, unknown>>(
  obj: T,
  fields: string[]
): T {
  const result = { ...obj };
  for (const field of fields) {
    if (typeof result[field] === "string") {
      (result as any)[field] = decrypt(result[field] as string);
    }
  }
  return result;
}
