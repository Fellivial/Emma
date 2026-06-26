import { describe, expect, it, vi } from "vitest";

import { normaliseBillingState } from "@/core/billing-state";
import { ensureClientMembership } from "@/core/client-membership";

type TableName = "client_members" | "clients";

interface MockOptions {
  membership?: { client_id: string; role?: string } | null;
  ownerClient?: { id: string } | null;
}

function createSupabaseMock(options: MockOptions = {}) {
  const calls = {
    clientInserts: [] as unknown[],
    membershipInserts: [] as unknown[],
  };

  const supabase = {
    from: vi.fn((table: TableName) => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => {
          if (table === "client_members") {
            return { data: options.membership ?? null, error: null };
          }

          return { data: options.ownerClient ?? null, error: null };
        }),
        insert: vi.fn((row: unknown) => {
          if (table === "clients") {
            calls.clientInserts.push(row);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "client-new" }, error: null })),
              })),
            };
          }

          calls.membershipInserts.push(row);
          return Promise.resolve({ error: null });
        }),
      };

      return builder;
    }),
  };

  return { supabase, calls };
}

describe("ensureClientMembership", () => {
  it("uses an existing membership without creating duplicate rows", async () => {
    const { supabase, calls } = createSupabaseMock({
      membership: { client_id: "client-existing", role: "owner" },
    });

    const result = await ensureClientMembership(supabase, { userId: "user-123" });

    expect(result.clientId).toBe("client-existing");
    expect(result.createdClient).toBe(false);
    expect(result.createdMembership).toBe(false);
    expect(calls.clientInserts).toHaveLength(0);
    expect(calls.membershipInserts).toHaveLength(0);
  });

  it("repairs a missing membership for an existing owned client", async () => {
    const { supabase, calls } = createSupabaseMock({
      membership: null,
      ownerClient: { id: "client-owned" },
    });

    const result = await ensureClientMembership(supabase, { userId: "user-123" });

    expect(result.clientId).toBe("client-owned");
    expect(result.createdClient).toBe(false);
    expect(result.createdMembership).toBe(true);
    expect(calls.clientInserts).toHaveLength(0);
    expect(calls.membershipInserts).toEqual([
      { client_id: "client-owned", user_id: "user-123", role: "owner" },
    ]);
  });

  it("creates one client and one owner membership for a new user", async () => {
    const { supabase, calls } = createSupabaseMock({
      membership: null,
      ownerClient: null,
    });

    const result = await ensureClientMembership(supabase, { userId: "user-abcdef" });

    expect(result.clientId).toBe("client-new");
    expect(result.createdClient).toBe(true);
    expect(result.createdMembership).toBe(true);
    expect(calls.clientInserts).toHaveLength(1);
    expect(calls.membershipInserts).toEqual([
      { client_id: "client-new", user_id: "user-abcdef", role: "owner" },
    ]);
  });
});

describe("normaliseBillingState", () => {
  it("shows trial subscriptions as trial instead of active paid", () => {
    const state = normaliseBillingState("starter", {
      status: "on_trial",
      renewsAt: "2026-07-01T00:00:00Z",
    });

    expect(state.status).toBe("on_trial");
    expect(state.isTrial).toBe(true);
    expect(state.isActivePaid).toBe(false);
  });

  it("marks past-due subscriptions as needing payment recovery", () => {
    const state = normaliseBillingState("pro", {
      status: "past_due",
      urls: { update_payment_method: "https://app.lemonsqueezy.com/billing/update" },
    });

    expect(state.needsPaymentRecovery).toBe(true);
    expect(state.recoveryUrl).toBe("https://app.lemonsqueezy.com/billing/update");
  });

  it("filters javascript, data, relative, and malformed billing URLs", () => {
    const cases = ["javascript:alert(1)", "data:text/html,hello", "/billing/portal", "https://"];

    for (const url of cases) {
      const state = normaliseBillingState("starter", {
        status: "active",
        urls: { customer_portal: url, update_payment_method: url },
      });

      expect(state.portalUrl).toBeNull();
      expect(state.recoveryUrl).toBeNull();
      expect(state.hasPortal).toBe(false);
    }
  });
  it("rejects non-Lemon http billing URLs", () => {
    const state = normaliseBillingState("pro", {
      status: "past_due",
      urls: {
        customer_portal: "https://billing.example/portal",
        update_payment_method: "https://billing.example/update",
      },
    });

    expect(state.portalUrl).toBeNull();
    expect(state.recoveryUrl).toBeNull();
    expect(state.hasPortal).toBe(false);
  });

  it("preserves valid LemonSqueezy billing URLs", () => {
    const state = normaliseBillingState("pro", {
      status: "past_due",
      urls: {
        customer_portal: "https://app.lemonsqueezy.com/my-orders/abc",
        update_payment_method: "https://store.lemonsqueezy.com/billing/update",
      },
    });

    expect(state.portalUrl).toBe("https://app.lemonsqueezy.com/my-orders/abc");
    expect(state.recoveryUrl).toBe("https://store.lemonsqueezy.com/billing/update");
    expect(state.hasPortal).toBe(true);
  });
});
