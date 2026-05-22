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
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "@/core/security/encryption";
import { LIMIT_BLOCK_MESSAGE } from "@/core/pricing";

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

function detectMaxTokens(msgs: ApiMessage[], hasDocuments = false): number {
  // Documents (PDFs) produce verbose responses — tables, summaries, extracted text.
  if (hasDocuments) return 2000;
  const text = getLastMessageText(msgs);
  if (DEEP_PATTERN.test(text)) return 1200;
  if (text.length < 80) return 350;
  return 700;
}

// "high" for analytical/generative tasks; "medium" for everything else.
// Avoids burning full effort budget on "what's on my calendar today".
function detectEffort(msgs: ApiMessage[], hasDocuments = false): "high" | "medium" {
  if (hasDocuments) return "high";
  return DEEP_PATTERN.test(getLastMessageText(msgs)) ? "high" : "medium";
}

// Calls /v1/messages/count_tokens to estimate input token cost before streaming.
// Returns 0 on any error so callers always fail open.
async function countRequestTokens(
  apiKey: string,
  model: string,
  system: unknown[],
  messages: unknown[]
): Promise<number> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, system, messages }),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return typeof data.input_tokens === "number" ? data.input_tokens : 0;
  } catch {
    return 0;
  }
}

// Loads the user's enabled MCP server configs from Supabase, decrypts tokens,
// and returns the mcp_servers array for the Anthropic request. Fails open.
async function loadMcpServers(userId: string): Promise<Record<string, unknown>[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  try {
    const supabase = createClient(url, key);
    const { data } = await supabase
      .from("user_mcp_servers")
      .select("name, url, auth_token, allowed_tools, blocked_tools")
      .eq("user_id", userId)
      .eq("enabled", true);
    if (!data || data.length === 0) return [];
    return data.map((row) => {
      const entry: Record<string, unknown> = {
        type: "url",
        url: row.url,
        name: row.name,
      };
      if (row.auth_token) {
        entry.authorization_token = decrypt(row.auth_token);
      }
      const toolConfig: Record<string, unknown> = { enabled: true };
      if (row.allowed_tools?.length) toolConfig.allowed_tools = row.allowed_tools;
      if (row.blocked_tools?.length) toolConfig.blocked_tools = row.blocked_tools;
      entry.tool_configuration = toolConfig;
      return entry;
    });
  } catch {
    return [];
  }
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
    const {
      messages,
      visionContext,
      persona = "mommy",
      activeUser,
      emotionState,
      attachedFiles,
      pdfUrls,
      userLocation,
      searchResults,
      skills,
    } = body;
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

    // Load user's MCP server configs (fail-open)
    let mcpServers: Record<string, unknown>[] = [];
    if (userId) {
      mcpServers = await loadMcpServers(userId);
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
    const apiMessages: ApiMessage[] = truncatedMessages.map((m: ApiMessage) => {
      if (typeof m.content === "string") {
        return { role: m.role, content: m.content };
      }
      return {
        role: m.role,
        content: (m.content as ApiMessageContent[]).map((block) => {
          if (block.type === "image" && block.source) {
            return { type: "image", source: block.source };
          }
          // Preserve document blocks (PDFs, files) from history verbatim
          if (block.type === "document" && block.source) {
            return { type: "document", source: block.source };
          }
          return { type: "text", text: block.text || "" };
        }),
      };
    });

    // ── Attach uploaded files and URL-based PDFs to the last user message ──────
    // Files uploaded via /api/emma/files are referenced by file_id.
    // Images become "image" blocks; everything else (PDFs, docs) becomes
    // "document" blocks. Direct PDF URLs are also injected as document blocks
    // without requiring a prior upload.
    const hasDocuments =
      (attachedFiles?.some((f) => !f.media_type.startsWith("image/")) ?? false) ||
      (pdfUrls?.length ?? 0) > 0 ||
      (searchResults?.length ?? 0) > 0;

    if (
      (attachedFiles && attachedFiles.length > 0) ||
      (pdfUrls && pdfUrls.length > 0) ||
      (searchResults && searchResults.length > 0)
    ) {
      const last = apiMessages[apiMessages.length - 1];
      if (last?.role === "user") {
        const textContent = typeof last.content === "string" ? last.content : "";
        const textBlock: import("@/types/emma").ApiMessageContent = {
          type: "text",
          text: textContent,
        };
        const fileBlocks: import("@/types/emma").ApiMessageContent[] = (attachedFiles ?? []).map(
          (f) => {
            if (f.media_type.startsWith("image/")) {
              return { type: "image", source: { type: "file", file_id: f.file_id } };
            }
            return { type: "document", source: { type: "file", file_id: f.file_id } };
          }
        );
        const urlBlocks: import("@/types/emma").ApiMessageContent[] = (pdfUrls ?? []).map(
          (url) => ({ type: "document", source: { type: "url", url } })
        );
        // search_results block: native RAG content for citation-quality source attribution.
        // Each result becomes a search_result entry with source URL, optional title, and text.
        const searchBlock =
          searchResults && searchResults.length > 0
            ? [
                {
                  type: "search_results",
                  results: searchResults.map((r) => ({
                    type: "search_result",
                    source: r.source,
                    ...(r.title && { title: r.title }),
                    content: [{ type: "text", text: r.content }],
                  })),
                } as unknown as import("@/types/emma").ApiMessageContent,
              ]
            : [];
        apiMessages[apiMessages.length - 1] = {
          ...last,
          content: [textBlock, ...fileBlocks, ...urlBlocks, ...searchBlock] as unknown as import("@/types/emma").ApiMessageContent[],
        };
      }
    }

    // ── Proactive token pre-count ─────────────────────────────────────────────
    // Estimate this request's input cost before streaming. If the estimate
    // would push any metering window over its limit, block now rather than
    // mid-response. Fails open: if countRequestTokens errors it returns 0.
    if (enforcementResult && enforcementResult.allWindows.length > 0) {
      const estimated = await countRequestTokens(apiKey, MODEL_BRAIN, systemBlocks, apiMessages);
      if (estimated > 0) {
        const overflowWindow = enforcementResult.allWindows.find(
          (w) => w.tokensLimit > 0 && w.tokensUsed + estimated >= w.tokensLimit
        );
        if (overflowWindow) {
          const blockMsg = LIMIT_BLOCK_MESSAGE;
          const preCountBlock = `data: ${JSON.stringify({
            type: "done",
            text: blockMsg,
            raw: blockMsg,
            commands: [],
            routineId: null,
            expression: "warm",
            enforcement: {
              status: "blocked",
              upgradeUrl: "/settings/billing?addon=extra_pack",
              window: overflowWindow.windowType,
            },
          })}\n\n`;
          return new Response(preCountBlock, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
          });
        }
      }
    }

    // ── Build beta header (dynamic — grows when optional features are enabled) ──
    const betaHeaderParts = [
      "compact-2026-01-12",
      "files-api-2025-04-14",
      "mcp-client-2025-11-20",
      ...(skills?.length ? ["code-execution-2025-08-25", "skills-2025-10-02"] : []),
    ];

    // ── Build server-side tools ───────────────────────────────────────────────
    // web_search_20260209 and web_fetch_20260209 are Anthropic-hosted (GA).
    // No beta header needed. Code execution inside these tools is free.
    const webSearchTool: Record<string, unknown> = {
      type: "web_search_20260209",
      name: "web_search",
      ...(userLocation && {
        user_location: {
          ...(userLocation.city && { city: userLocation.city }),
          ...(userLocation.country && { country: userLocation.country }),
          ...(userLocation.timezone && { timezone: userLocation.timezone }),
        },
      }),
    };
    const webFetchTool: Record<string, unknown> = {
      type: "web_fetch_20260209",
      name: "web_fetch",
      max_content_tokens: 5000,
    };
    // code_execution is a server-side tool — Anthropic runs the code in a
    // sandboxed container. Only included when the client requests skills.
    const codeExecutionTool: Record<string, unknown> | null = skills?.length
      ? { type: "code_execution_20250825", name: "code_execution" }
      : null;
    // Skills container — pre-built Anthropic skill sets for document generation.
    const container: Record<string, unknown> | null = skills?.length
      ? {
          skills: skills.map((skill_id) => ({
            type: "anthropic",
            skill_id,
            version: "latest",
          })),
        }
      : null;

    // ── Streaming request to Anthropic ───────────────────────────────────────

    const anthropicRes = await fetchWithRetry(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": betaHeaderParts.join(","),
        },
        body: JSON.stringify({
          model: MODEL_BRAIN,
          max_tokens: detectMaxTokens(messages, hasDocuments),
          system: systemBlocks,
          messages: apiMessages,
          tools: [webSearchTool, webFetchTool, ...(codeExecutionTool ? [codeExecutionTool] : [])],
          ...(container && { container }),
          ...(mcpServers.length > 0 && { mcp_servers: mcpServers }),
          stream: true,
          output_config: { effort: detectEffort(messages, hasDocuments) },
          citations: { enabled: true },
          context_management: {
            edits: [
              {
                type: "compact_20260112",
                trigger: { type: "input_tokens", value: 600_000 },
              },
            ],
          },
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
        // Accumulate non-text content blocks (compaction blocks) so the client
        // can preserve them in the next request's assistant message.
        const nonTextBlocks: Record<string, unknown>[] = [];
        // Accumulate citation blocks delivered via citations_delta stream events.
        const citations: Record<string, unknown>[] = [];
        // Accumulate file_ids produced by code_execution tool invocations.
        const generatedFiles: { file_id: string; name?: string }[] = [];

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

                // Capture non-text content blocks (compaction, server_tool_use,
                // server_tool_result) so the client can preserve them in history.
                // Also emit a tool_start event so the UI can show a "Searching…" indicator.
                if (
                  event.type === "content_block_start" &&
                  event.content_block?.type &&
                  event.content_block.type !== "text"
                ) {
                  nonTextBlocks.push(event.content_block as Record<string, unknown>);
                  if (
                    event.content_block.type === "server_tool_use" ||
                    event.content_block.type === "mcp_tool_use"
                  ) {
                    const toolEvent = JSON.stringify({
                      type: "tool_start",
                      tool: event.content_block.name ?? "unknown",
                      ...(event.content_block.server_name && {
                        server: event.content_block.server_name,
                      }),
                    });
                    controller.enqueue(encoder.encode(`data: ${toolEvent}\n\n`));
                  }
                }

                // Extract file_ids from code_execution tool results.
                // server_tool_result blocks produced by code_execution may contain
                // document blocks or direct file references in their content array.
                if (
                  event.type === "content_block_start" &&
                  event.content_block?.type === "server_tool_result" &&
                  Array.isArray(event.content_block.content)
                ) {
                  for (const item of event.content_block.content as Record<string, unknown>[]) {
                    // Direct file reference: { file_id, filename? }
                    if (typeof item.file_id === "string") {
                      generatedFiles.push({
                        file_id: item.file_id,
                        name: typeof item.filename === "string" ? item.filename : undefined,
                      });
                    }
                    // Document block with file source: { type:"document", source:{ type:"file", file_id }, title? }
                    const src = item.source as Record<string, unknown> | undefined;
                    if (item.type === "document" && src?.type === "file" && typeof src.file_id === "string") {
                      generatedFiles.push({
                        file_id: src.file_id,
                        name: typeof item.title === "string" ? item.title : undefined,
                      });
                    }
                  }
                }

                // Capture citations delivered as citations_delta events.
                if (
                  event.type === "content_block_delta" &&
                  event.delta?.type === "citations_delta" &&
                  event.delta.citation
                ) {
                  citations.push(event.delta.citation as Record<string, unknown>);
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
            citations: citations.length > 0 ? citations : undefined,
            generatedFiles: generatedFiles.length > 0 ? generatedFiles : undefined,
            compactionBlocks: nonTextBlocks.length > 0 ? nonTextBlocks : undefined,
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
