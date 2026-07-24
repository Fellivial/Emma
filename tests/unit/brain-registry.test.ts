/**
 * brain-registry.test.ts
 *
 * Provider Registry (ADR 0006, Technical Design §3).
 *
 * Named `brain-registry.test.ts`, not the plan's literal `registry.test.ts`
 * (Phase 5 §5.1 task 5) — that filename is already taken by the pre-existing,
 * unrelated Account Deletion Resource Registry suite
 * (`tests/unit/registry.test.ts`, testing `@/core/account-deletion/registry`).
 * See the Wave 6A Implementation Decision Log for this naming deviation.
 *
 *   - register(): duplicate-name rejection, CapabilitiesDescriptor validation
 *   - get(): lookup by name, undefined when absent
 *   - getConfigured(): only isConfigured()===true providers, registration order
 *   - findByCapability(): boolean hard-requirements, contextWindowTokens floor,
 *     restricted to configured providers
 *   - list(): every registered provider regardless of configured status
 */

import { describe, it, expect } from "vitest";
import { createProviderRegistry } from "@/core/brain/registry";
import type { BrainProvider, CapabilitiesDescriptor } from "@/core/brain/types";

function fakeProvider(name: string, configured = true): BrainProvider {
  return {
    name,
    isConfigured: () => configured,
    chat: async () => {
      throw new Error("not implemented in fake provider");
    },
    chatStream: async () => {
      throw new Error("not implemented in fake provider");
    },
    embed: async () => {
      throw new Error("not implemented in fake provider");
    },
  };
}

const FULL_CAPABILITIES: CapabilitiesDescriptor = {
  supportsStreaming: true,
  supportsVision: true,
  supportsToolCalling: true,
  supportsEmbeddings: true,
  supportsStructuredOutput: true,
  contextWindowTokens: 128_000,
};

describe("createProviderRegistry", () => {
  describe("register", () => {
    it("registers a provider with a valid descriptor", () => {
      const registry = createProviderRegistry();
      expect(() => registry.register(fakeProvider("a"), FULL_CAPABILITIES)).not.toThrow();
      expect(registry.get("a")).toBeDefined();
    });

    it("rejects a duplicate provider name", () => {
      const registry = createProviderRegistry();
      registry.register(fakeProvider("a"), FULL_CAPABILITIES);
      expect(() => registry.register(fakeProvider("a"), FULL_CAPABILITIES)).toThrow(
        "Provider 'a' already registered."
      );
    });

    it("allows two distinct provider names", () => {
      const registry = createProviderRegistry();
      registry.register(fakeProvider("a"), FULL_CAPABILITIES);
      expect(() => registry.register(fakeProvider("b"), FULL_CAPABILITIES)).not.toThrow();
      expect(registry.list()).toHaveLength(2);
    });

    it("rejects a descriptor missing a required boolean field", () => {
      const registry = createProviderRegistry();
      const incomplete = { ...FULL_CAPABILITIES } as Partial<CapabilitiesDescriptor>;
      delete incomplete.supportsVision;
      expect(() =>
        registry.register(fakeProvider("a"), incomplete as CapabilitiesDescriptor)
      ).toThrow(/supportsVision/);
    });

    it("rejects contextWindowTokens <= 0", () => {
      const registry = createProviderRegistry();
      expect(() =>
        registry.register(fakeProvider("a"), { ...FULL_CAPABILITIES, contextWindowTokens: 0 })
      ).toThrow(/contextWindowTokens/);
    });

    it("rejects a non-integer contextWindowTokens", () => {
      const registry = createProviderRegistry();
      expect(() =>
        registry.register(fakeProvider("a"), { ...FULL_CAPABILITIES, contextWindowTokens: 1.5 })
      ).toThrow(/contextWindowTokens/);
    });
  });

  describe("get", () => {
    it("returns the registered entry by name", () => {
      const registry = createProviderRegistry();
      const provider = fakeProvider("a");
      registry.register(provider, FULL_CAPABILITIES);
      expect(registry.get("a")?.provider).toBe(provider);
      expect(registry.get("a")?.capabilities).toEqual(FULL_CAPABILITIES);
    });

    it("returns undefined for an unregistered name", () => {
      const registry = createProviderRegistry();
      expect(registry.get("nonexistent")).toBeUndefined();
    });
  });

  describe("getConfigured", () => {
    it("returns only providers whose isConfigured() is true, in registration order", () => {
      const registry = createProviderRegistry();
      registry.register(fakeProvider("unconfigured", false), FULL_CAPABILITIES);
      registry.register(fakeProvider("configured-1", true), FULL_CAPABILITIES);
      registry.register(fakeProvider("configured-2", true), FULL_CAPABILITIES);

      const configured = registry.getConfigured();
      expect(configured.map((e) => e.provider.name)).toEqual(["configured-1", "configured-2"]);
    });

    it("returns an empty array when no provider is configured", () => {
      const registry = createProviderRegistry();
      registry.register(fakeProvider("a", false), FULL_CAPABILITIES);
      expect(registry.getConfigured()).toEqual([]);
    });
  });

  describe("findByCapability", () => {
    it("returns providers satisfying every required boolean capability", () => {
      const registry = createProviderRegistry();
      registry.register(fakeProvider("vision-only"), {
        ...FULL_CAPABILITIES,
        supportsToolCalling: false,
      });
      registry.register(fakeProvider("full"), FULL_CAPABILITIES);

      const matches = registry.findByCapability({
        supportsVision: true,
        supportsToolCalling: true,
      });
      expect(matches.map((e) => e.provider.name)).toEqual(["full"]);
    });

    it("imposes no constraint for capabilities omitted from the requirement", () => {
      const registry = createProviderRegistry();
      registry.register(fakeProvider("a"), FULL_CAPABILITIES);
      expect(registry.findByCapability({}).map((e) => e.provider.name)).toEqual(["a"]);
    });

    it("treats contextWindowTokens as a minimum floor", () => {
      const registry = createProviderRegistry();
      registry.register(fakeProvider("small"), {
        ...FULL_CAPABILITIES,
        contextWindowTokens: 8_000,
      });
      registry.register(fakeProvider("large"), {
        ...FULL_CAPABILITIES,
        contextWindowTokens: 200_000,
      });

      const matches = registry.findByCapability({ contextWindowTokens: 100_000 });
      expect(matches.map((e) => e.provider.name)).toEqual(["large"]);
    });

    it("returns [] when no configured provider satisfies the requirement", () => {
      const registry = createProviderRegistry();
      registry.register(fakeProvider("a"), { ...FULL_CAPABILITIES, supportsToolCalling: false });
      expect(registry.findByCapability({ supportsToolCalling: true })).toEqual([]);
    });

    it("excludes unconfigured providers even if their descriptor matches", () => {
      const registry = createProviderRegistry();
      registry.register(fakeProvider("a", false), FULL_CAPABILITIES);
      expect(registry.findByCapability({ supportsVision: true })).toEqual([]);
    });
  });

  describe("list", () => {
    it("returns every registered provider regardless of configured status, in registration order", () => {
      const registry = createProviderRegistry();
      registry.register(fakeProvider("a", false), FULL_CAPABILITIES);
      registry.register(fakeProvider("b", true), FULL_CAPABILITIES);
      expect(registry.list().map((e) => e.provider.name)).toEqual(["a", "b"]);
    });

    it("returns an empty array for a freshly created registry", () => {
      expect(createProviderRegistry().list()).toEqual([]);
    });
  });
});
