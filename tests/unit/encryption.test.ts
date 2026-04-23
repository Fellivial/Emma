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
});
