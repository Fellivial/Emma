import * as Sentry from "@sentry/nextjs";
import { MODEL_BRAIN } from "@/core/models";
import { NextRequest } from "next/server";
import type { EmmaApiRequest, ApiMessage, ApiMessageContent } from "@/types/emma";
import { buildSystemPromptBlocks } from "@/core/personas";
import { parseEmmaResponse } from "@/core/command-parser";
import { getMemoriesForUser, incrementUsage } from "@/core/memory-db";
import { fetchWithRetry, getPersonaErrorMessage, EmmaError } from "@/lib/errors";
import { sanitiseInput, getInjectionRejectionMessage } from "@/core/security/sanitise";
import { audit } from "@/core/security/audit";
import {
  checkUsage,
  recordUsage,
  markWarningSent,
  type EnforcementResult,
} from "@/core/usage-enforcer";
import { loadClientConfigForUser } from "@/core/client-config";
import { getVertical } from "@/core/verticals/templates";
import { getUser } from "@/lib/supabase/server";

const MAX_HISTORY_MESSAGES = 20;

const DEEP_PATTERN =
  /\b(write|code|implement|creat|generat|explain|analyz|list|step|how to|debug|fix|refactor|compar|summariz|translat|convert|build|draft)\b/i;

function truncateHistory(msgs: ApiMessage[]): ApiMessage[] {
  if (msgs.length <= MAX_HISTORY_MESSAGES) return msgs;
  return msgs.slice(-MAX_HISTORY_MESSAGES);
}

function getLastMessageText(msgs: ApiMessage[]): string {
  const last = msgs[msgs.length - 1];
  if (typeof last?.content === "string") return last.content;
  if (Array.isArray(last?.content)) {
    return (last.content as ApiMessageContent[])
      .map((b) => (b.type === "text" ? b.text || "" : ""))
      .join(" ");
  }
  return "";
}

function detectMaxTokens(msgs: ApiMessage[]): number {
  const text = getLastMessageText(msgs);
  if (DEEP_PATTERN.test(text)) return 1200;
  if (text.length < 80) return 350;
  return 700;
}

// "high" for analytical/generative tasks; "medium" for everything else.
// Avoids burning full effort budget on "what's on my calendar today".
function detectEffort(msgs: ApiMessage[]): "high" | "medium" {
  return DEEP_PATTERN.test(getLastMessageText(msgs)) ? "high" : "medium";
}

/**
 * Streaming brain route.
 *
 * Sends streamed text deltas to the client as they arrive from Anthropic.
 * After the full response is collected, appends a final JSON event with
 * parsed commands, expression, and routineId.
 *
 * Client receives SSE events:
 *   data: {"type":"delta","text":"Mmm"}
 *   data: {"type":"delta","text":"…"}
 *   data: {"type":"done","text":"full text","raw":"raw","commands":[...],"expression":"smirk","routineId":null}
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    // Require authentication in production; dev mode (no Supabase) falls through
    let sessionUserId: string | undefined;
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const sessionUser = await getUser();
      if (!sessionUser) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      sessionUserId = sessionUser.id;
    }

    const body = (await req.json()) as EmmaApiRequest;
    const { messages, visionContext, persona = "mommy", activeUser, emotionState } = body;
    // deviceGraph removed — Emma no longer controls physical devices
    const deviceGraph = {};

    // Use session-verified ID for data operations; fall back to body for dev mode
    const userId = sessionUserId ?? activeUser?.id;
    let memories: any[] = [];
    if (userId) {
      try {
        memories = await getMemoriesForUser(userId);
      } catch {
        // DB not available — continue without memories
      }
    }

    // Load per-client config and resolve vertical (fail-open)
    let clientConfigForPrompt = null;
    if (userId) {
      try {
        clientConfigForPrompt = await loadClientConfigForUser(userId);
      } catch {
        // continue without vertical
      }
    }
    const vertical = clientConfigForPrompt?.verticalId
      ? getVertical(clientConfigForPrompt.verticalId)
      : undefined;

    const systemBlocks = buildSystemPromptBlocks({
      personaId: persona as "mommy" | "neutral",
      deviceGraph,
      memories,
      visionContext,
      activeUser,
      emotionState,
      vertical,
    });

    // ── Sanitise user messages ─────────────────────────────────────────────
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg?.role === "user" && typeof lastUserMsg.content === "string") {
      const sanitised = sanitiseInput(lastUserMsg.content);

      if (sanitised.blocked) {
        // Log the attempt and return rejection
        audit({
          userId: userId || "unknown",
          action: "execute",
          resource: "message",
          reason: `Blocked: ${sanitised.flags.join(", ")}`,
          metadata: { threat: sanitised.threat, flags: sanitised.flags },
        }).catch(() => {});

        const rejection = getInjectionRejectionMessage();
        const encoder = new TextEncoder();
        const body = `data: ${JSON.stringify({ type: "done", text: rejection, raw: rejection, commands: [], routineId: null, expression: "skeptical" })}\n\n`;
        return new Response(body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      }

      // Use sanitised version
      if (sanitised.modified) {
        messages[messages.length - 1] = { ...lastUserMsg, content: sanitised.clean };
      }

      // Log threat if detected (but not blocked)
      if (sanitised.threat !== "none") {
        audit({
          userId: userId || "unknown",
          action: "execute",
          resource: "message",
          reason: `Threat detected (${sanitised.threat}): ${sanitised.flags.join(", ")}`,
          metadata: { threat: sanitised.threat, flags: sanitised.flags },
        }).catch(() => {});
      }
    }

    // ── Usage enforcement ─────────────────────────────────────────────────
    let enforcementResult: EnforcementResult | null = null;
    if (userId) {
      try {
        const clientConfig = clientConfigForPrompt ?? (await loadClientConfigForUser(userId));
        const planId = clientConfig.planId || "free";
        const userTimezone = (body as any).userTimezone || "UTC";
        const billingAnchorDay = (body as any).billingAnchorDay || 1;

        enforcementResult = await checkUsage(userId, planId, userTimezone, billingAnchorDay);

        if (enforcementResult.status === "blocked") {
          const blockMsg =
            enforcementResult.message || "Mmm. You've used me a lot today. Grab some extra time?";
          const blockBody = `data: ${JSON.stringify({
            type: "done",
            text: blockMsg,
            raw: blockMsg,
            commands: [],
            routineId: null,
            expression: "warm",
            enforcement: {
              status: "blocked",
              upgradeUrl: enforcementResult.upgradeUrl,
              window: enforcementResult.blockedWindow?.windowType,
            },
          })}\n\n`;
          return new Response(blockBody, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
          });
        }
      } catch {
        // Fail open — never block due to metering bug
      }
    }

    // Build API messages (truncate to last 20 to control input token cost)
    const truncatedMessages = truncateHistory(messages);
    const apiMessages = truncatedMessages.map((m: ApiMessage) => {
      if (typeof m.content === "string") {
        return { role: m.role, content: m.content };
      }
      return {
        role: m.role,
        content: (m.content as ApiMessageContent[]).map((block) => {
          if (block.type === "image" && block.source) {
            return { type: "image", source: block.source };
          }
          return { type: "text", text: block.text || "" };
        }),
      };
    });

    // ── Streaming request to Anthropic ───────────────────────────────────────

    const anthropicRes = await fetchWithRetry(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL_BRAIN,
          max_tokens: detectMaxTokens(messages),
          system: systemBlocks,
          messages: apiMessages,
          stream: true,
          output_config: { effort: detectEffort(messages) },
        }),
      },
      { maxRetries: 2, connectionTimeoutMs: 30_000 }
    );

    if (!anthropicRes.ok) {
      const status = anthropicRes.status;
      const errMsg = getPersonaErrorMessage(status);
      return new Response(JSON.stringify({ error: errMsg, status }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── Stream SSE to client ─────────────────────────────────────────────────

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const reader = anthropicRes.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let fullText = "";
        let buffer = "";
        let inputTokens = 0;
        let outputTokens = 0;
        let cacheReadTokens = 0;
        let cacheCreationTokens = 0;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;

              try {
                const event = JSON.parse(data);

                // Capture token usage from Anthropic stream events
                if (event.type === "message_start" && event.message?.usage) {
                  const u = event.message.usage;
                  inputTokens = u.input_tokens || 0;
                  cacheReadTokens = u.cache_read_input_tokens || 0;
                  cacheCreationTokens = u.cache_creation_input_tokens || 0;
                }
                if (event.type === "message_delta" && event.usage) {
                  outputTokens = event.usage.output_tokens || 0;
                }

                // Content block delta — stream text to client
                if (event.type === "content_block_delta" && event.delta?.text) {
                  const text = event.delta.text;
                  fullText += text;

                  // Don't stream [EMMA_CMD], [EMMA_ROUTINE], or [emotion:] tags
                  if (
                    !text.includes("[EMMA_CMD]") &&
                    !text.includes("[EMMA_ROUTINE]") &&
                    !text.includes("[emotion:")
                  ) {
                    const sseData = JSON.stringify({ type: "delta", text });
                    controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
                  }
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }

          // ── Final event with parsed response ────────────────────────────────
          const { text, commands, routineId, expression } = parseEmmaResponse(fullText);

          // Note: commands array is no longer dispatched to physical devices.
          // Emma is a digital workspace agent — see workflow-routines for equivalent.

          const doneEvent = JSON.stringify({
            type: "done",
            text,
            raw: fullText,
            commands,
            routineId: routineId || null,
            expression: expression || null,
            usage: { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens },
            enforcement: enforcementResult
              ? {
                  status: enforcementResult.status,
                  message:
                    enforcementResult.status === "warning" ? enforcementResult.message : null,
                  warningWindow: enforcementResult.warningWindow?.windowType || null,
                  upgradeUrl: enforcementResult.upgradeUrl || null,
                }
              : null,
          });
          controller.enqueue(encoder.encode(`data: ${doneEvent}\n\n`));

          // Persist usage tracking (non-blocking)
          if (userId) {
            incrementUsage(userId, 1, inputTokens + outputTokens).catch(() => {});

            // Multi-window tracking
            const planId = enforcementResult?.planId || "free";
            recordUsage(
              userId,
              inputTokens,
              outputTokens,
              planId,
              (body as any).userTimezone || "UTC",
              (body as any).billingAnchorDay || 1
            ).catch(() => {});

            // Mark warning sent if surfaced this request
            if (enforcementResult?.status === "warning" && enforcementResult.warningWindow) {
              markWarningSent(
                userId,
                enforcementResult.warningWindow.windowType,
                enforcementResult.warningWindow.windowStart
              ).catch(() => {});
            }
          }
        } catch (err) {
          Sentry.captureException(err);
          const errEvent = JSON.stringify({
            type: "error",
            text: getPersonaErrorMessage(500),
          });
          controller.enqueue(encoder.encode(`data: ${errEvent}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[EMMA API] Unexpected error:", err);
    const status = err instanceof EmmaError ? err.status : 500;
    return new Response(JSON.stringify({ error: getPersonaErrorMessage(status) }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
