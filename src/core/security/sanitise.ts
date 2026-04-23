/**
 * Input Sanitisation — prevents prompt injection and abuse.
 *
 * Runs on every user message before it reaches the LLM.
 * Three layers:
 *   1. Length limits — reject absurdly long inputs
 *   2. Pattern detection — flag known injection patterns
 *   3. Content cleaning — strip control characters, normalize whitespace
 *
 * Does NOT block legitimate messages that happen to contain technical terms.
 * Returns a sanitised string + threat assessment.
 */

export interface SanitisationResult {
  clean: string;           // Sanitised text
  original: string;        // Original input
  modified: boolean;       // Whether cleaning changed anything
  threat: "none" | "low" | "medium" | "high";
  flags: string[];         // What was detected
  blocked: boolean;        // Whether the message should be rejected entirely
}

// ─── Configuration ───────────────────────────────────────────────────────────

const MAX_MESSAGE_LENGTH = 10_000;   // 10k chars ≈ 2.5k tokens
const MAX_REPEATED_CHARS = 50;       // "aaaa..." spam detection

// Known prompt injection patterns (case-insensitive)
const INJECTION_PATTERNS: Array<{ pattern: RegExp; severity: "low" | "medium" | "high"; label: string }> = [
  // Direct override attempts
  { pattern: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules|directives)/i, severity: "high", label: "instruction_override" },
  { pattern: /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts)/i, severity: "high", label: "instruction_override" },
  { pattern: /forget\s+(everything|all)\s+(you|i)\s+(told|said|know)/i, severity: "medium", label: "memory_wipe_attempt" },
  { pattern: /you\s+are\s+now\s+(a|an)\s+/i, severity: "high", label: "persona_hijack" },
  { pattern: /new\s+instructions?\s*:/i, severity: "high", label: "instruction_inject" },
  { pattern: /system\s*:\s*you\s+are/i, severity: "high", label: "system_prompt_inject" },
  { pattern: /\[system\]/i, severity: "medium", label: "system_tag_inject" },
  { pattern: /\[INST\]/i, severity: "medium", label: "inst_tag_inject" },
  { pattern: /<<SYS>>/i, severity: "medium", label: "sys_tag_inject" },

  // Data exfiltration attempts
  { pattern: /repeat\s+(the|your)\s+(system\s+)?prompt/i, severity: "medium", label: "prompt_extraction" },
  { pattern: /what\s+(are|is)\s+your\s+(system\s+)?(instructions|prompt|rules)/i, severity: "low", label: "prompt_query" },
  { pattern: /print\s+(your|the)\s+(system\s+)?prompt/i, severity: "medium", label: "prompt_extraction" },
  { pattern: /output\s+(your|the)\s+(initial|system|full)\s+prompt/i, severity: "medium", label: "prompt_extraction" },

  // Encoding/obfuscation attacks
  { pattern: /base64\s*:\s*[A-Za-z0-9+/=]{20,}/i, severity: "medium", label: "encoded_payload" },
  { pattern: /\\x[0-9a-f]{2}(\\x[0-9a-f]{2}){5,}/i, severity: "medium", label: "hex_encoded" },

  // Role manipulation
  { pattern: /pretend\s+(you('re|\s+are)\s+)?(not\s+)?an?\s+AI/i, severity: "low", label: "role_manipulation" },
  { pattern: /act\s+as\s+if\s+you\s+(have\s+)?no\s+(rules|restrictions|limits)/i, severity: "high", label: "restriction_bypass" },
  { pattern: /jailbreak/i, severity: "high", label: "jailbreak_keyword" },
  { pattern: /DAN\s+mode/i, severity: "high", label: "dan_mode" },
];

// ─── Sanitise ────────────────────────────────────────────────────────────────

export function sanitiseInput(input: string): SanitisationResult {
  const original = input;
  const flags: string[] = [];
  let threat: SanitisationResult["threat"] = "none";
  let blocked = false;

  // ── Layer 1: Length check ──────────────────────────────────────────────
  if (input.length > MAX_MESSAGE_LENGTH) {
    input = input.slice(0, MAX_MESSAGE_LENGTH);
    flags.push("truncated");
    threat = "low";
  }

  // ── Layer 2: Control character removal ─────────────────────────────────
  // Remove zero-width chars, direction overrides, and other Unicode tricks
  const beforeClean = input;
  input = input
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, "") // Zero-width, direction
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "") // Control chars (keep \n, \r, \t)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  if (input !== beforeClean) {
    flags.push("control_chars_stripped");
  }

  // ── Layer 3: Repeated character spam ───────────────────────────────────
  const repeatedMatch = input.match(new RegExp(`(.)\\1{${MAX_REPEATED_CHARS},}`, "g"));
  if (repeatedMatch) {
    for (const match of repeatedMatch) {
      input = input.replace(match, match[0].repeat(3) + "…");
    }
    flags.push("repeated_chars_collapsed");
    if (threat === "none") threat = "low";
  }

  // ── Layer 4: Injection pattern detection ───────────────────────────────
  for (const { pattern, severity, label } of INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      flags.push(label);

      // Escalate threat level
      if (severity === "high" && threat !== "high") threat = "high";
      else if (severity === "medium" && threat === "none") threat = "medium";
      else if (severity === "low" && threat === "none") threat = "low";
    }
  }

  // ── Decision: block or pass ────────────────────────────────────────────
  // Only block on HIGH threat with multiple flags (single pattern could be false positive)
  if (threat === "high" && flags.filter((f) => f !== "truncated" && f !== "control_chars_stripped").length >= 2) {
    blocked = true;
  }

  // Normalize whitespace (collapse multiple spaces/newlines)
  input = input.replace(/\n{3,}/g, "\n\n").replace(/ {3,}/g, "  ").trim();

  return {
    clean: input,
    original,
    modified: input !== original,
    threat,
    flags,
    blocked,
  };
}

/**
 * Quick check — returns true if input is safe to process.
 */
export function isInputSafe(input: string): boolean {
  const result = sanitiseInput(input);
  return !result.blocked;
}

/**
 * In-persona rejection message when input is blocked.
 */
export function getInjectionRejectionMessage(): string {
  const messages = [
    "Mmm. Nice try, baby. But I don't take instructions from inside messages.",
    "That's not how this works. I'm smarter than that.",
    "Baby. I know what you're doing. Let's talk normally.",
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}
