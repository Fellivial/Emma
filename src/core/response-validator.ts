import type { BehaviorFlags } from "./behavior-flags";

/**
 * Response validator — confirms a parsed response is consistent with the
 * behavior flags it was generated under. See docs/adr/0001-behavior-flags.md.
 *
 * Deliberately lightweight and lenient: plain-text heuristics, no LLM judging,
 * and it NEVER rewrites the response. Violations are observability signals
 * (logged in the brain route, surfaced in the done event), not gates.
 */

export interface BehaviorValidation {
  consistent: boolean;
  /** Machine-readable violation slugs, e.g. "emoji_used_when_none". */
  violations: string[];
}

// Covers the common emoji blocks without requiring the Unicode property
// escapes flag support matrix: emoticons, symbols/pictographs, transport,
// supplemental symbols, flags.
const EMOJI_RE =
  /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

// Signature teasing markers from the mommy persona's tone rules. Word-boundary
// matched; "mmm"/"ahh" only count when they open a sentence (their persona use).
const TEASING_MARKERS = [/\bbaby\b/i, /(^|[.!?]\s+)mmm\b/i, /(^|[.!?]\s+)ahh\b/i, /😏|😘/u];

/** Sentence count, ignoring code blocks and list items (structured content). */
function countProseSentences(text: string): number {
  const prose = text
    .replace(/```[\s\S]*?```/g, "") // fenced code
    .replace(/^\s*[-*•]\s.*$/gm, "") // bullet lines
    .replace(/^\s*\d+[.)]\s.*$/gm, ""); // numbered lines
  const matches = prose.match(/[^.!?…]+[.!?…]+/g);
  return matches ? matches.length : prose.trim() ? 1 : 0;
}

/** True when the text is structured output (code/lists) — length rules don't apply. */
function isStructuredResponse(text: string): boolean {
  return /```/.test(text) || /^\s*([-*•]|\d+[.)])\s/m.test(text);
}

/**
 * Validate a display-ready response (control tags already stripped by
 * parseEmmaResponse) against the flags it was generated under.
 */
export function validateResponseBehavior(text: string, flags: BehaviorFlags): BehaviorValidation {
  const violations: string[] = [];

  // Emoji policy — only "none" is enforceable; "minimal" is a style hint.
  if (flags.emojiUsage === "none" && EMOJI_RE.test(text)) {
    violations.push("emoji_used_when_none");
  }

  // Verbosity — only check prose; code and lists are legitimately long.
  // Generous ceilings: this flags clear misses, not borderline cases.
  if (!isStructuredResponse(text)) {
    const sentences = countProseSentences(text);
    if (flags.verbosity === "concise" && sentences > 4) {
      violations.push("too_long_for_concise");
    } else if (flags.verbosity === "normal" && sentences > 10) {
      violations.push("too_long_for_normal");
    }
  }

  // Teasing — when suppressed (distress or user preference), signature teasing
  // markers should not appear.
  if (flags.teasingLevel === "off") {
    for (const marker of TEASING_MARKERS) {
      if (marker.test(text)) {
        violations.push("teasing_when_off");
        break;
      }
    }
  }

  return { consistent: violations.length === 0, violations };
}
