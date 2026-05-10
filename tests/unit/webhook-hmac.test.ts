import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";

// Minimal Supabase mock — webhook tests need a configured DB to reach HMAC check
const mockSupabase = vi.hoisted(() => ({
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
    insert: vi.fn().mockResolvedValue({ error: null }),
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mockSupabase),
}));

vi.mock("@/core/security/audit", () => ({
  audit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/get-client-ip", () => ({
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@/core/pricing", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    getPlanByLemonVariant: vi.fn(() => null),
  };
});

import { POST } from "@/app/api/lemon/webhook/route";

const WEBHOOK_SECRET = "test-webhook-secret-32chars-padding";

function makeRequest(body: string, signature?: string): NextRequest {
  return new NextRequest("http://localhost/api/lemon/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(signature !== undefined ? { "x-signature": signature } : {}),
    },
    body,
  });
}

function validHmac(body: string): string {
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
}

const minimalEvent = JSON.stringify({
  meta: { event_name: "subscription_created", custom_data: {} },
  data: { attributes: { status: "active", variant_id: "999" } },
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fake.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fake-key");
  vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", WEBHOOK_SECRET);
});

describe("LemonSqueezy webhook — configuration guards", () => {
  it("returns 501 when DB is not configured", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", WEBHOOK_SECRET);
    const req = makeRequest(minimalEvent, validHmac(minimalEvent));
    const res = await POST(req);
    expect(res.status).toBe(501);
  });

  it("returns 501 when webhook secret is not configured", async () => {
    vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", "");
    const req = makeRequest(minimalEvent, validHmac(minimalEvent));
    const res = await POST(req);
    expect(res.status).toBe(501);
  });
});

describe("LemonSqueezy webhook — HMAC verification", () => {
  it("returns 400 when x-signature header is missing", async () => {
    const req = makeRequest(minimalEvent);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/signature/i);
  });

  it("returns 401 when signature is wrong (HMAC mismatch)", async () => {
    const req = makeRequest(minimalEvent, "deadbeef".repeat(8));
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/signature/i);
  });

  it("returns 401 when body is tampered after signing", async () => {
    const sig = validHmac(minimalEvent);
    const tampered = minimalEvent.replace("subscription_created", "subscription_cancelled");
    const req = makeRequest(tampered, sig);
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with received:true when signature is valid and user_id absent", async () => {
    const req = makeRequest(minimalEvent, validHmac(minimalEvent));
    const res = await POST(req);
    // No user_id in custom_data → early-return 200
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  it("accepts valid signature for a different payload", async () => {
    const payload = JSON.stringify({ meta: { event_name: "ping", custom_data: {} }, data: {} });
    const sig = validHmac(payload);
    const req = makeRequest(payload, sig);
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
