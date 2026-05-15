"use client";

import { useState, useCallback, useRef } from "react";
import type { ApiMessage } from "@/types/emma";

// ─── Configuration ───────────────────────────────────────────────────────────

export interface ContextConfig {
  maxTokens: number; // Total budget (100k)
  systemPromptReserve: number; // Reserved for system prompt
  responseReserve: number; // Reserved for max_tokens response
  summaryTriggerRatio: number; // Trigger summarization when messages exceed this % of budget
  minMessagesToKeep: number; // Always keep at least this many recent messages
  minMessagesToSummarize: number; // Don't summarize fewer than this
}

export const DEFAULT_CONFIG: ContextConfig = {
  maxTokens: 100_000,
  systemPromptReserve: 6_000, // System prompt is ~3-5k, pad to 6k
  responseReserve: 1_500, // max_tokens 1024 + overhead
  summaryTriggerRatio: 0.75, // Summarize when 75% of message budget used
  minMessagesToKeep: 10, // Always keep last 10 messages
  minMessagesToSummarize: 6, // Need at least 6 old messages before summarizing
};

// ─── Token Estimation ────────────────────────────────────────────────────────

/**
 * Rough token estimation: ~4 characters per token for English text.
 * Claude uses BPE tokenization — this is an approximation that errs
 * on the conservative side (slightly overestimates).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // ~4 chars per token, but code/JSON tends to be ~3.5
  // Use 3.8 as a balanced estimate
  return Math.ceil(text.length / 3.8);
}

/**
 * Estimate tokens for a message, handling multimodal content.
 */
export function estimateMessageTokens(msg: ApiMessage): number {
  if (typeof msg.content === "string") {
    return estimateTokens(msg.content) + 4; // +4 for role/message overhead
  }

  // Multimodal: text blocks + image tokens
  let tokens = 4;
  for (const block of msg.content) {
    if (block.type === "text" && block.text) {
      tokens += estimateTokens(block.text);
    } else if (block.type === "image") {
      tokens += 1600; // ~1600 tokens for a typical image
    }
  }
  return tokens;
}

/**
 * Estimate total tokens for an array of messages.
 */
export function estimateTotalTokens(messages: ApiMessage[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

// ─── Context Budget ──────────────────────────────────────────────────────────

export interface ContextBudget {
  total: number;
  systemPrompt: number;
  response: number;
  messages: number; // Budget available for messages
  used: number; // Currently used by messages
  remaining: number; // How much room left
  utilization: number; // 0-1 ratio
  overBudget: boolean;
  needsSummarization: boolean;
}

export function calculateBudget(
  messages: ApiMessage[],
  systemPromptTokens: number,
  config: ContextConfig = DEFAULT_CONFIG
): ContextBudget {
  const messageBudget = config.maxTokens - config.systemPromptReserve - config.responseReserve;
  const used = estimateTotalTokens(messages);
  const remaining = messageBudget - used;
  const utilization = used / messageBudget;

  return {
    total: config.maxTokens,
    systemPrompt: systemPromptTokens,
    response: config.responseReserve,
    messages: messageBudget,
    used,
    remaining: Math.max(0, remaining),
    utilization: Math.min(1, utilization),
    overBudget: used > messageBudget,
    needsSummarization: utilization >= config.summaryTriggerRatio,
  };
}

// ─── Sliding Window ──────────────────────────────────────────────────────────

/**
 * Split messages into "old" (to be summarized) and "recent" (to keep).
 *
 * Strategy:
 * 1. Always keep the last `minMessagesToKeep` messages
 * 2. If a conversation summary exists (first message from assistant with [SUMMARY] prefix),
 *    keep it as-is — it will be updated by summarization
 * 3. Everything between the summary and the recent window is "old" → to be summarized
 */
export function splitMessages(
  messages: ApiMessage[],
  config: ContextConfig = DEFAULT_CONFIG
): { summary: ApiMessage | null; old: ApiMessage[]; recent: ApiMessage[] } {
  // Check if first message is an existing summary
  let summary: ApiMessage | null = null;
  let startIdx = 0;

  if (
    messages.length > 0 &&
    messages[0].role === "assistant" &&
    typeof messages[0].content === "string" &&
    messages[0].content.startsWith("[SUMMARY]")
  ) {
    summary = messages[0];
    startIdx = 1;
  }

  const remaining = messages.slice(startIdx);
  const keepCount = Math.min(config.minMessagesToKeep, remaining.length);
  const splitPoint = remaining.length - keepCount;

  const old = remaining.slice(0, splitPoint);
  const recent = remaining.slice(splitPoint);

  return { summary, old, recent };
}

/**
 * Trim messages to fit within token budget.
 * Removes oldest messages first (after any summary) until under budget.
 */
export function trimToFit(
  messages: ApiMessage[],
  budgetTokens: number,
  config: ContextConfig = DEFAULT_CONFIG
): ApiMessage[] {
  let current = [...messages];

  while (estimateTotalTokens(current) > budgetTokens && current.length > config.minMessagesToKeep) {
    // Find the first non-summary message to remove
    // Never remove index 0 if it's a summary — it's the compressed history
    const removeIdx = current.findIndex(
      (m, i) => !(i === 0 && typeof m.content === "string" && m.content.startsWith("[SUMMARY]"))
    );

    if (removeIdx === -1 || current.length <= config.minMessagesToKeep) break;
    current.splice(removeIdx, 1);
  }

  return current;
}

// ─── Summarization ───────────────────────────────────────────────────────────

/**
 * Build the text payload for the summarize API call.
 */
export function buildSummarizationPayload(
  existingSummary: string | null,
  oldMessages: ApiMessage[]
): string {
  let text = "";

  if (existingSummary) {
    text += `Previous summary:\n${existingSummary}\n\n`;
  }

  text += "New messages to incorporate:\n";
  for (const msg of oldMessages) {
    const content =
      typeof msg.content === "string"
        ? msg.content
        : msg.content
            .filter((b) => b.type === "text")
            .map((b) => b.text)
            .join(" ");
    text += `${msg.role}: ${content}\n`;
  }

  return text;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface ContextStats {
  budget: ContextBudget;
  messageCount: number;
  summaryExists: boolean;
  summarizationCount: number;
  lastSummarizedAt: number | null;
}

interface UseContextManagerReturn {
  stats: ContextStats;
  /**
   * Process messages before sending to API.
   * Returns the managed message array (possibly trimmed/summarized).
   * May trigger an async summarization call.
   */
  processMessages: (messages: ApiMessage[]) => Promise<{
    managed: ApiMessage[];
    summarized: boolean;
  }>;
  config: ContextConfig;
}

export function useContextManager(config: ContextConfig = DEFAULT_CONFIG): UseContextManagerReturn {
  const [stats, setStats] = useState<ContextStats>({
    budget: {
      total: config.maxTokens,
      systemPrompt: config.systemPromptReserve,
      response: config.responseReserve,
      messages: config.maxTokens - config.systemPromptReserve - config.responseReserve,
      used: 0,
      remaining: config.maxTokens - config.systemPromptReserve - config.responseReserve,
      utilization: 0,
      overBudget: false,
      needsSummarization: false,
    },
    messageCount: 0,
    summaryExists: false,
    summarizationCount: 0,
    lastSummarizedAt: null,
  });

  const summarizingRef = useRef(false);

  const processMessages = useCallback(
    async (messages: ApiMessage[]): Promise<{ managed: ApiMessage[]; summarized: boolean }> => {
      const budget = calculateBudget(messages, config.systemPromptReserve, config);

      // ── Case 1: Under budget, no action needed ────────────────────────
      if (!budget.needsSummarization && !budget.overBudget) {
        setStats((s) => ({
          ...s,
          budget,
          messageCount: messages.length,
        }));
        return { managed: messages, summarized: false };
      }

      // ── Case 2: Needs summarization ───────────────────────────────────
      const { summary, old, recent } = splitMessages(messages, config);

      // If not enough old messages to summarize, just trim
      if (old.length < config.minMessagesToSummarize) {
        const trimmed = trimToFit(messages, budget.messages, config);
        const newBudget = calculateBudget(trimmed, config.systemPromptReserve, config);
        setStats((s) => ({
          ...s,
          budget: newBudget,
          messageCount: trimmed.length,
        }));
        return { managed: trimmed, summarized: false };
      }

      // Prevent concurrent summarizations
      if (summarizingRef.current) {
        const trimmed = trimToFit(messages, budget.messages, config);
        return { managed: trimmed, summarized: false };
      }

      summarizingRef.current = true;

      try {
        // Build summarization request
        const existingSummaryText =
          summary && typeof summary.content === "string"
            ? summary.content.replace("[SUMMARY] ", "")
            : null;

        const payload = buildSummarizationPayload(existingSummaryText, old);

        // Call summarization API
        const res = await fetch("/api/emma/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: payload }),
        });

        if (!res.ok) {
          // Summarization failed — fall back to trim
          console.warn("[Context] Summarization failed, trimming instead");
          const trimmed = trimToFit(messages, budget.messages, config);
          return { managed: trimmed, summarized: false };
        }

        const data = await res.json();
        const summaryText: string = data.summary || "";

        // Build new message array: [summary] + recent
        const summaryMsg: ApiMessage = {
          role: "assistant",
          content: `[SUMMARY] ${summaryText}`,
        };

        const managed = [summaryMsg, ...recent];

        // Final trim if still over budget
        const finalManaged = trimToFit(managed, budget.messages, config);
        const newBudget = calculateBudget(finalManaged, config.systemPromptReserve, config);

        setStats({
          budget: newBudget,
          messageCount: finalManaged.length,
          summaryExists: true,
          summarizationCount: stats.summarizationCount + 1,
          lastSummarizedAt: Date.now(),
        });

        return { managed: finalManaged, summarized: true };
      } catch (err) {
        console.error("[Context] Summarization error:", err);
        const trimmed = trimToFit(messages, budget.messages, config);
        return { managed: trimmed, summarized: false };
      } finally {
        summarizingRef.current = false;
      }
    },
    [config, stats.summarizationCount]
  );

  return { stats, processMessages, config };
}
