import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const waSrc = readFileSync(
  resolve(process.cwd(), "src/app/api/emma/ingest/whatsapp/route.ts"),
  "utf8"
);

// ── HIGH-05 ──────────────────────────────────────────────────────────────────

describe("HIGH-05: WhatsApp webhook rejects missing client_id", () => {
  it("has an early return for missing client_id before DB validation", () => {
    // !clientId guard must come BEFORE the supabase clients lookup
    const missingGuardIdx = waSrc.indexOf("Missing client_id");
    const supabaseLookupIdx = waSrc.indexOf('.from("clients")');
    expect(missingGuardIdx).toBeGreaterThan(-1);
    expect(supabaseLookupIdx).toBeGreaterThan(-1);
    expect(missingGuardIdx).toBeLessThan(supabaseLookupIdx);
  });

  it("does not have the old clientId && supabase conditional pattern", () => {
    expect(waSrc).not.toContain("if (clientId && supabase)");
  });

  it("HMAC signature check still precedes the client_id gate", () => {
    const hmacIdx = waSrc.indexOf("signatureValid");
    const missingGuardIdx = waSrc.indexOf("Missing client_id");
    expect(hmacIdx).toBeGreaterThan(-1);
    expect(missingGuardIdx).toBeGreaterThan(-1);
    expect(hmacIdx).toBeLessThan(missingGuardIdx);
  });
});

// ── MED-09 ──────────────────────────────────────────────────────────────────

describe("MED-09: WhatsApp reply loop applies sanitiseInput", () => {
  it("imports sanitiseInput", () => {
    expect(waSrc).toContain("sanitiseInput");
    expect(waSrc).toContain("@/core/security/sanitise");
  });

  it("blocks injection before LLM call", () => {
    const replyFnBody = waSrc.slice(waSrc.indexOf("async function replyToWhatsApp"));
    const sanitiseIdx = replyFnBody.indexOf("sanitiseInput(");
    const llmIdx = replyFnBody.indexOf("enforceCostGate");
    expect(sanitiseIdx).toBeGreaterThan(-1);
    expect(llmIdx).toBeGreaterThan(-1);
    expect(sanitiseIdx).toBeLessThan(llmIdx);
  });

  it("returns early when input is blocked", () => {
    const replyFnBody = waSrc.slice(waSrc.indexOf("async function replyToWhatsApp"));
    expect(replyFnBody).toContain("sanitised.blocked");
    expect(replyFnBody).toMatch(/sanitised\.blocked[\s\S]{0,120}return/);
  });

  it("uses safeText instead of raw inboundText in message array", () => {
    const replyFnBody = waSrc.slice(waSrc.indexOf("async function replyToWhatsApp"));
    expect(replyFnBody).toContain("safeText");
    // The raw inboundText should NOT appear in the user message content after sanitisation
    expect(replyFnBody).not.toMatch(/content: inboundText/);
  });
});
