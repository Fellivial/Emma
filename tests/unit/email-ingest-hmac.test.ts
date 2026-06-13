import { describe, it, expect } from "vitest";
import crypto from "crypto";

// Replicates the exact algorithm from src/app/api/emma/ingest/email/route.ts
// without importing the route handler (which requires Next.js / Supabase wiring).
function validateSignature(body: string, sigHeader: string, secret: string): boolean {
  const sigValue = sigHeader.startsWith("sha256=") ? sigHeader.slice(7) : sigHeader;
  if (!sigValue) return false;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sigValue));
  } catch {
    return false;
  }
}

const SECRET = "test-ingest-email-secret-32chars";
const BODY = JSON.stringify({ from: "user@example.com", subject: "Hello", text: "World" });

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

describe("email ingest HMAC validation", () => {
  it("returns true for a valid raw-hex signature", () => {
    expect(validateSignature(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it("returns true for a valid signature with sha256= prefix (Sendgrid/Mailgun style)", () => {
    expect(validateSignature(BODY, `sha256=${sign(BODY)}`, SECRET)).toBe(true);
  });

  it("returns false when the body has been tampered after signing", () => {
    const sig = sign(BODY);
    const tampered = BODY.replace("Hello", "Injected");
    expect(validateSignature(tampered, sig, SECRET)).toBe(false);
  });

  it("returns false when the wrong secret is used to verify", () => {
    const sig = sign(BODY, "completely-different-secret-xyz");
    expect(validateSignature(BODY, sig, SECRET)).toBe(false);
  });

  it("returns false for an empty signature string", () => {
    expect(validateSignature(BODY, "", SECRET)).toBe(false);
  });
});
