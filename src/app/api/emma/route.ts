import * as Sentry from "@sentry/nextjs";
import { BRAIN_MODELS } from "@/core/models";
import { NextRequest } from "next/server";
import type { EmmaApiRequest, ApiMessage, ApiMessageContent } from "@/types/emma";
import { buildSystemPrompt } from "@/core/personas";
import { parseEmmaResponse } from "@/core/command-parser";
import { getRelevantMemoriesForUser, getLatestConversationSummary } from "@/core/memory-db";
import { fetchWithRetry, getPersonaErrorMessage, EmmaError } from "@/lib/errors";
import { sanitiseInput, getInjectionRejectionMessage } from "@/core/security/sanitise";
import { audit } from "@/core/security/audit";
import { markWarningSent, type EnforcementResult } from "@/core/usage-enforcer";
import { loadClientConfigForUser } from "@/core/client-config";
import { resolveUser } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  validateProductionEnvironment,
  validateSupabaseAuthEnvironment,
} from "@/core/env-validation";
import { decrypt } from "@/core/security/encryption";
import { getPlan } from "@/core/pricing";
import { OPENROUTER_URL, openRouterHeaders } from "@/lib/openrouter";
import type { CustomPersona, ToneAdjective, TopicTag } from "@/types/persona";
import { embedText } from "@/lib/embeddings";
import { enforceCostGate, recordCostResult } from "@/core/cost-gate";

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
/**
 * Streaming brain route.
 *
 * Sends streamed text deltas to the client as they arrive from OpenRouter.
 * After the full response is collected, appends a final JSON event with
 * parsed commands, expression, and routineId.
 *
 * Client receives SSE events:
 *   data: {"type":"delta","text":"Mmm"}
 *   data: {"type":"delta","text":"…"}
 *   data: {"type":"done","text":"full text","raw":"raw","commands":[...],"expression":"smirk","routineId":null}
 */
export async function POST(req: NextRequest) {
  try {
    if (!validateSupabaseAuthEnvironment().valid) {
      return Response.json(
        { error: "Server authentication is not configured correctly." },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (!validateProductionEnvironment().valid) {
      return Response.json(
        { error: "Server configuration is not valid." },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    // ── Auth ─────────────────────────────────────────────────────────────────
    // Require authentication when Supabase is configured; local no-Supabase mode falls through.
    let sessionUserId: string | undefined;
    const auth = await resolveUser();
    if (auth.status === "configuration_error") {
      return Response.json(
        { error: "Server authentication is not configured correctly." },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (auth.status !== "development_bypass") {
      if (auth.status === "unauthenticated") {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      const sessionUser = auth.user;
      // ── Waitlist gate ────────────────────────────────────────────────────
      const adminEmails = (process.env.EMMA_ADMIN_EMAILS || "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      const isAdmin =
        adminEmails.length > 0 && adminEmails.includes(sessionUser.email?.toLowerCase() ?? "");
      if (!isAdmin && sessionUser.app_metadata?.waitlist_approved !== true) {
        return new Response(JSON.stringify({ error: "Waitlist approval required" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
      // ────────────────────────────────────────────────────────────────────
      sessionUserId = sessionUser.id;
    }

    const body = (await req.json()) as EmmaApiRequest;
    const {
      messages,
      visionContext,
      persona = "mommy",
      activeUser,
      emotionState,
      pdfUrls,
      searchResults,
    } = body;
    // deviceGraph removed — Emma no longer controls physical devices
    const deviceGraph = {};

    // Request-body identity is a local-development convenience, never production authentication.
    const userId =
      sessionUserId ?? (process.env.NODE_ENV === "production" ? undefined : activeUser?.id);

    const chatCostDecision = await enforceCostGate({ operation: "chat", userId });
    if (!chatCostDecision.allowed) {
      return Response.json(
        { error: chatCostDecision.message, code: chatCostDecision.reason },
        { status: chatCostDecision.status, headers: { "Cache-Control": "no-store" } }
      );
    }

    let memories: import("@/types/emma").MemoryEntry[] = [];
    if (userId) {
      try {
        memories = await getRelevantMemoriesForUser(userId, getLastMessageText(messages));
      } catch {
        // DB not available — continue without memories
      }
    }

    // Load conversation summary for cross-session context injection (fail-open)
    let conversationSummary: string | undefined;
    if (userId) {
      try {
        const convo = await getLatestConversationSummary(userId);
        conversationSummary = convo?.summary ?? undefined;
      } catch {
        // continue without summary
      }
    }

    // Load per-client config (fail-open)
    let clientConfigForPrompt = null;
    if (userId) {
      try {
        clientConfigForPrompt = await loadClientConfigForUser(userId);
      } catch {
        // continue without config
      }
    }

    // Load custom persona (Pro/Enterprise only, fail-open)
    let customPersona: CustomPersona | undefined;
    if (userId) {
      try {
        const planId = clientConfigForPrompt?.planId ?? "free";
        if (getPlan(planId).features.customPersona) {
          const supabase = getSupabaseAdmin();
          if (supabase) {
            const { data: row } = await supabase
              .from("personas")
              .select("*")
              .eq("user_id", userId)
              .maybeSingle();
            if (row) {
              customPersona = {
                id: row.id as string,
                userId: row.user_id as string,
                name: (row.name as string | null) ?? undefined,
                basePersonaId: (row.base_persona_id as "mommy" | "neutral") ?? "neutral",
                toneAdjectives: (row.tone_adjectives as ToneAdjective[]) ?? [],
                communicationStyle: (row.communication_style as "formal" | "casual") ?? "casual",
                verbosity: (row.verbosity as "concise" | "normal" | "verbose") ?? "normal",
                topicsEmphasise: (row.topics_emphasise as TopicTag[]) ?? [],
                topicsAvoid: (row.topics_avoid as TopicTag[]) ?? [],
                language: (row.language as string) ?? "en",
                voiceId: row.voice_id
                  ? (() => {
                      try {
                        return decrypt(row.voice_id as string);
                      } catch {
                        return undefined;
                      }
                    })()
                  : undefined,
                description: row.description
                  ? (() => {
                      try {
                        return decrypt(row.description as string);
                      } catch {
                        return undefined;
                      }
                    })()
                  : undefined,
                descriptionScreenedAt: (row.description_screened_at as string | null) ?? undefined,
                createdAt: row.created_at as string,
                updatedAt: row.updated_at as string,
              };
            }
          }
        }
      } catch {
        // fail-open — continue without custom persona
      }
    }

    // Retrieve document context via semantic search (Pro/Enterprise, fail-open)
    let documentContext: string | undefined;
    if (userId) {
      try {
        const planId = clientConfigForPrompt?.planId ?? "free";
        if (getPlan(planId).features.customPersona) {
          const queryText = getLastMessageText(messages);
          if (queryText.trim()) {
            const queryEmbedding = await embedText(queryText, {
              userId,
              planId: clientConfigForPrompt?.planId,
            });
            const supabase = getSupabaseAdmin();
            if (supabase) {
              type ChunkRow = { doc_label: string; chunk_text: string; similarity: number };
              const { data: chunks } = await supabase.rpc("match_document_chunks", {
                query_embedding: `[${queryEmbedding.join(",")}]`,
                match_user_id: userId,
                match_threshold: 0.75,
                match_count: 3,
              });
              if (chunks && (chunks as ChunkRow[]).length > 0) {
                documentContext = (chunks as ChunkRow[])
                  .map((c, i) => `[Source: ${c.doc_label}, excerpt ${i + 1}]\n${c.chunk_text}`)
                  .join("\n\n");
              }
            }
          }
        }
      } catch {
        // fail-open — continue without document context
      }
    }

    const userTimezone = body.userTimezone ?? "UTC";
    const timeContext = (() => {
      try {
        return new Intl.DateTimeFormat("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: userTimezone,
          timeZoneName: "short",
        }).format(new Date());
      } catch {
        return new Intl.DateTimeFormat("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: "UTC",
          timeZoneName: "short",
        }).format(new Date());
      }
    })();

    const systemPromptText = buildSystemPrompt({
      personaId: persona as "mommy" | "neutral",
      deviceGraph,
      memories,
      visionContext,
      activeUser,
      emotionState,
      customRoutines: clientConfigForPrompt?.customRoutines ?? [],
      previousContext: conversationSummary,
      customPersona,
      documentContext,
      timeContext,
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
    const enforcementResult: EnforcementResult = chatCostDecision.warning ?? {
      status: "ok",
      planId: chatCostDecision.identity.planId,
      allWindows: [],
    };

    // Build API messages (truncate to last 20 to control token cost)
    const truncatedMessages = truncateHistory(messages);
    const hasDocuments = (pdfUrls?.length ?? 0) > 0 || (searchResults?.length ?? 0) > 0;

    // Build OpenAI-format messages — images become image_url blocks.
    // PDFs and search results are injected as text into the last user message.
    const apiMessages = truncatedMessages.map((m: ApiMessage) => {
      if (typeof m.content === "string") {
        return { role: m.role, content: m.content };
      }
      // Map Anthropic content blocks → OpenAI content parts
      type OAIPart =
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } };
      const parts: OAIPart[] = [];
      for (const block of m.content as ApiMessageContent[]) {
        const src = block.source as Record<string, unknown> | undefined;
        if (block.type === "image" && src?.type === "base64") {
          parts.push({
            type: "image_url",
            image_url: {
              url: `data:${String(src.media_type || "image/jpeg")};base64,${String(src.data || "")}`,
            },
          });
        } else if (block.type === "document" || (src && src.type === "file")) {
          // Drop document/file blocks — Files API is Anthropic-only
        } else {
          parts.push({ type: "text", text: block.text || "" });
        }
      }
      return {
        role: m.role,
        content: parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts,
      };
    });

    // Inject PDF URLs and search results as text into the last user message
    if (hasDocuments) {
      const last = apiMessages[apiMessages.length - 1];
      if (last?.role === "user") {
        const baseText =
          typeof last.content === "string"
            ? last.content
            : Array.isArray(last.content)
              ? (last.content as Array<{ type?: string; text?: string }>)
                  .filter((p) => p.type === "text")
                  .map((p) => p.text || "")
                  .join(" ")
              : "";
        const extras: string[] = [];
        if (pdfUrls?.length) extras.push(`[Attached PDFs: ${pdfUrls.join(", ")}]`);
        if (searchResults?.length) {
          extras.push(
            "[Search results]\n" +
              searchResults.map((r) => `Source: ${r.source}\n${r.content}`).join("\n\n")
          );
        }
        apiMessages[apiMessages.length - 1] = {
          ...last,
          content: [baseText, ...extras].filter(Boolean).join("\n\n"),
        };
      }
    }

    // ── Streaming request to OpenRouter ──────────────────────────────────────
    const anthropicRes = await fetchWithRetry(
      OPENROUTER_URL,
      {
        method: "POST",
        headers: openRouterHeaders(),
        body: JSON.stringify({
          models: BRAIN_MODELS,
          max_tokens: detectMaxTokens(messages, hasDocuments),
          stream: true,
          messages: [{ role: "system", content: systemPromptText }, ...apiMessages],
        }),
      },
      { maxRetries: 2, connectionTimeoutMs: 30_000 }
    );

    if (!anthropicRes.ok) {
      await recordCostResult(chatCostDecision, { success: false });
      const status = anthropicRes.status;
      const upstreamBody = await anthropicRes.text().catch(() => "");
      console.error(`[EMMA] OpenRouter API error ${status}:`, upstreamBody.slice(0, 500));
      Sentry.captureMessage(`OpenRouter error ${status}`, {
        level: status >= 500 ? "error" : "warning",
        extra: { status, body: upstreamBody.slice(0, 200) },
      });
      const errMsg = getPersonaErrorMessage(status);
      const code =
        status === 400
          ? "BAD_REQUEST"
          : status === 401
            ? "AUTH_ERROR"
            : status === 429
              ? "RATE_LIMIT"
              : status === 529
                ? "OVERLOADED"
                : status === 504
                  ? "TIMEOUT"
                  : "UPSTREAM_ERROR";
      return new Response(JSON.stringify({ error: errMsg, status, code }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── Stream SSE to client ─────────────────────────────────────────────────

    const encoder = new TextEncoder();
    let providerReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let observedInputTokens = 0;
    let observedOutputTokens = 0;
    let accountingPromise: ReturnType<typeof recordCostResult> | null = null;
    const accountOnce = (success: boolean) => {
      accountingPromise ??= recordCostResult(chatCostDecision, {
        inputTokens: observedInputTokens,
        outputTokens: observedOutputTokens,
        success,
      });
      return accountingPromise;
    };
    const readable = new ReadableStream({
      async start(controller) {
        const reader = anthropicRes.body?.getReader();
        providerReader = reader;
        if (!reader) {
          await accountOnce(false);
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let fullText = "";
        let buffer = "";
        let inputTokens = 0;
        let outputTokens = 0;
        let finishReason: string | null = null;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const raw = line.slice(6).trim();
              if (raw === "[DONE]") continue;

              try {
                const chunk = JSON.parse(raw);

                // Capture usage and finish_reason from the last chunk
                if (chunk.usage) {
                  inputTokens = chunk.usage.prompt_tokens || 0;
                  outputTokens = chunk.usage.completion_tokens || 0;
                  observedInputTokens = inputTokens;
                  observedOutputTokens = outputTokens;
                }
                const fr = chunk.choices?.[0]?.finish_reason;
                if (fr) finishReason = fr;

                // Stream text delta to client
                const delta = chunk.choices?.[0]?.delta?.content;
                if (typeof delta === "string" && delta) {
                  fullText += delta;

                  // Don't stream internal tags
                  if (
                    !delta.includes("[EMMA_CMD]") &&
                    !delta.includes("[EMMA_ROUTINE]") &&
                    !delta.includes("[emotion:")
                  ) {
                    const sseData = JSON.stringify({ type: "delta", text: delta });
                    controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
                  }
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }

          // ── Final event with parsed response ─────────────────────────────
          const { text, commands, routineId, expression } = parseEmmaResponse(fullText);

          const doneEvent = JSON.stringify({
            type: "done",
            text,
            raw: fullText,
            commands,
            routineId: routineId || null,
            expression: expression || null,
            refused: finishReason === "content_filter",
            contextWindowExceeded: finishReason === "length",
            usage: { inputTokens, outputTokens, cacheReadTokens: 0, cacheCreationTokens: 0 },
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

          await accountOnce(true);

          if (userId) {
            // Mark warning sent if surfaced this request
            if (enforcementResult?.status === "warning" && enforcementResult.warningWindow) {
              markWarningSent(
                userId,
                enforcementResult.warningWindow.windowType,
                enforcementResult.warningWindow.windowStart,
                chatCostDecision.identity.clientId ?? undefined
              ).catch(() => {});
            }
          }
        } catch (err) {
          await accountOnce(false);
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
      async cancel() {
        await accountOnce(false);
        await providerReader?.cancel().catch(() => {});
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
