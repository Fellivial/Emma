import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We need to mock the env var for testing
describe("encryption", () => {
  const TEST_KEY = "a".repeat(64); // 32 bytes in hex

  beforeEach(() => {
    vi.stubEnv("EMMA_ENCRYPTION_KEY", TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("encrypts and decrypts round-trip", async () => {
    // Dynamic import to pick up env change
    const { encrypt, decrypt } = await import("@/core/security/encryption");
    const plaintext = "User's favorite color is blue";
    const encrypted = encrypt(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.startsWith("enc:v1:")).toBe(true);

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext for same input (random IV)", async () => {
    const { encrypt } = await import("@/core/security/encryption");
    const text = "same input";
    const a = encrypt(text);
    const b = encrypt(text);
    expect(a).not.toBe(b); // Different IVs
  });

  it("returns plaintext unchanged when no key configured", async () => {
    vi.stubEnv("EMMA_ENCRYPTION_KEY", "");
    // Re-import to get fresh module
    const mod = await import("@/core/security/encryption");
    const result = mod.encrypt("hello");
    expect(result).toBe("hello");
  });

  it("returns plaintext for non-encrypted strings (backward compat)", async () => {
    const { decrypt } = await import("@/core/security/encryption");
    const plain = "not encrypted at all";
    expect(decrypt(plain)).toBe(plain);
  });

  it("handles unicode content", async () => {
    const { encrypt, decrypt } = await import("@/core/security/encryption");
    const text = "ユーザーは東京に住んでいます 🏠";
    const encrypted = encrypt(text);
    expect(decrypt(encrypted)).toBe(text);
  });

  it("handles empty string", async () => {
    const { encrypt, decrypt } = await import("@/core/security/encryption");
    const encrypted = encrypt("");
    expect(decrypt(encrypted)).toBe("");
  });

  it("returns key-missing sentinel when decrypting without a key", async () => {
    vi.stubEnv("EMMA_ENCRYPTION_KEY", "");
    const { decrypt } = await import("@/core/security/encryption");
    const result = decrypt("enc:v1:aabbccdd:eeff:0011");
    expect(result).toBe("[encrypted — key missing]");
  });

  it("returns decryption-failed for corrupted ciphertext", async () => {
    const { decrypt } = await import("@/core/security/encryption");
    // Valid prefix and 3 parts, but garbage IV/tag — GCM auth tag will fail
    const corrupted =
      "enc:v1:aabbccddaabbccddaabbccddaabbccdd:deadbeef:aabbccddaabbccddaabbccddaabbccdd";
    const result = decrypt(corrupted);
    expect(result).toBe("[decryption failed]");
  });

  it("decryptFields decrypts specified string fields and leaves others untouched", async () => {
    const { encrypt, decryptFields } = await import("@/core/security/encryption");
    const obj = {
      secret: encrypt("my secret value"),
      name: "Alice",
      count: 42,
    } as Record<string, unknown>;
    const result = decryptFields(obj, ["secret", "count"]);
    expect(result.secret).toBe("my secret value");
    expect(result.name).toBe("Alice");
    expect(result.count).toBe(42); // non-string: skipped
  });

  it("decryptFields skips non-string fields silently", async () => {
    const { decryptFields } = await import("@/core/security/encryption");
    const obj = { flag: true, num: 99 } as Record<string, unknown>;
    const result = decryptFields(obj, ["flag", "num"]);
    expect(result.flag).toBe(true);
    expect(result.num).toBe(99);
  });
});
