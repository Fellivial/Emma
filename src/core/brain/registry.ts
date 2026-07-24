/**
 * Provider Registry — a per-request-queryable structure holding every
 * configured provider instance (ADR 0006).
 *
 * Replaces the Gateway's single module-level provider reference with a
 * lookup (by name or by capability). Boot-time-populated and immutable
 * after boot — this is deliberately NOT a Runtime Configuration Store
 * (ADR 0012 defers that); no add/remove happens after module load
 * (Technical Design §3.2).
 */

import type { BrainProvider, CapabilitiesDescriptor } from "@/core/brain/types";

export interface RegisteredProvider {
  provider: BrainProvider;
  capabilities: CapabilitiesDescriptor;
}

export interface ProviderRegistry {
  /** Throws if a provider with this name is already registered (boot-time programmer error). */
  register(provider: BrainProvider, capabilities: CapabilitiesDescriptor): void;
  get(name: string): RegisteredProvider | undefined;
  /** Providers whose isConfigured() === true, in registration order. */
  getConfigured(): RegisteredProvider[];
  /**
   * Providers satisfying every capability named in `requirement`. A boolean
   * field is satisfied only when explicitly required (`true`) and the
   * provider's own descriptor also reports `true` — absent/`false` fields in
   * `requirement` impose no constraint. `contextWindowTokens`, when present,
   * is satisfied by any provider whose own value is at least the required
   * amount. Restricted to configured providers only.
   */
  findByCapability(requirement: Partial<CapabilitiesDescriptor>): RegisteredProvider[];
  /** Every registered provider, configured or not, in registration order. */
  list(): RegisteredProvider[];
}

const REQUIRED_BOOLEAN_FIELDS: (keyof CapabilitiesDescriptor)[] = [
  "supportsStreaming",
  "supportsVision",
  "supportsToolCalling",
  "supportsEmbeddings",
  "supportsStructuredOutput",
];

function assertValidDescriptor(name: string, capabilities: CapabilitiesDescriptor): void {
  for (const field of REQUIRED_BOOLEAN_FIELDS) {
    if (typeof capabilities[field] !== "boolean") {
      throw new Error(
        `Provider '${name}' registered with invalid CapabilitiesDescriptor: '${field}' must be a boolean.`
      );
    }
  }
  if (
    typeof capabilities.contextWindowTokens !== "number" ||
    !Number.isInteger(capabilities.contextWindowTokens) ||
    capabilities.contextWindowTokens <= 0
  ) {
    throw new Error(
      `Provider '${name}' registered with invalid CapabilitiesDescriptor: 'contextWindowTokens' must be a positive integer.`
    );
  }
}

function satisfiesCapability(
  capabilities: CapabilitiesDescriptor,
  requirement: Partial<CapabilitiesDescriptor>
): boolean {
  for (const field of REQUIRED_BOOLEAN_FIELDS) {
    if (requirement[field] === true && capabilities[field] !== true) return false;
  }
  if (
    requirement.contextWindowTokens !== undefined &&
    capabilities.contextWindowTokens < requirement.contextWindowTokens
  ) {
    return false;
  }
  return true;
}

export function createProviderRegistry(): ProviderRegistry {
  const entries = new Map<string, RegisteredProvider>();

  return {
    register(provider, capabilities) {
      if (entries.has(provider.name)) {
        throw new Error(`Provider '${provider.name}' already registered.`);
      }
      assertValidDescriptor(provider.name, capabilities);
      entries.set(provider.name, { provider, capabilities });
    },

    get(name) {
      return entries.get(name);
    },

    getConfigured() {
      return [...entries.values()].filter((entry) => entry.provider.isConfigured());
    },

    findByCapability(requirement) {
      return this.getConfigured().filter((entry) =>
        satisfiesCapability(entry.capabilities, requirement)
      );
    },

    list() {
      return [...entries.values()];
    },
  };
}
