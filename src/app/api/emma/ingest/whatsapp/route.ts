import * as crypto from "crypto";
import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { WhatsAppAdapter } from "@/core/integrations/whatsapp";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { UTILITY_MODELS } from "@/core/models";
import { OPENROUTER_URL, openRouterHeaders, extractText, extractUsage } from "@/lib/openrouter";
import { enforceCostGate, recordCostResult } from "@/core/cost-gate";
import { sanitiseInput } from "@/core/security/sanitise";
import { checkDistributedRateLimit } from "@/lib/ratelimit";

const adapter = new WhatsAppAdapter();
export const WHATSAPP_SENDER_RATE_LIMIT = 4;
export const WHATSAPP_SENDER_RATE_WINDOW_SECONDS = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge || "", { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  // Verify X-Hub-Signature-256 before processing — Meta always sends this
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.error("[WhatsApp ingest] WHATSAPP_APP_SECRET is not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const body = await req.text();
  const sigHeader = req.headers.get("x-hub-signature-256") || "";
  const sigValue = sigHeader.startsWith("sha256=") ? sigHeader.slice(7) : sigHeader;

  const expected = crypto.createHmac("sha256", appSecret).update(body).digest("hex");
  let signatureValid = false;
  try {
    signatureValid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sigValue));
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const payload = JSON.parse(body);
    const message = adapter.parseInboundWebhook(payload);
    // Clients configure their webhook URL as /api/emma/ingest/whatsapp?client_id=<uuid>
    const clientId = new URL(req.url).searchParams.get("client_id") || null;

    const supabase = getSupabaseAdmin();

    if (!clientId) {
      return NextResponse.json({ error: "Missing client_id" }, { status: 400 });
    }
    if (supabase) {
      const { data: clientRow } = await supabase
        .from("clients")
        .select("id")
        .eq("id", clientId)
        .single();
      if (!clientRow) {
        return NextResponse.json({ error: "Invalid client_id" }, { status: 400 });
      }
    }

    if (message && message.text) {
      const receivedAt = message.timestamp;
      const windowExpiresAt = new Date(
        new Date(receivedAt).getTime() + 24 * 60 * 60 * 1000
      ).toISOString();

      if (supabase) {
        await supabase.from("ingested_whatsapp").upsert(
          {
            from_number: message.from,
            message_id: message.messageId,
            body: message.text,
            received_at: receivedAt,
            direction: "inbound",
            window_expires_at: windowExpiresAt,
            ...(clientId ? { client_id: clientId } : {}),
          },
          { onConflict: "message_id" }
        );

        // Fire reply loop after returning 200 — Meta expects fast acknowledgement
        after(async () => {
          try {
            await replyToWhatsApp(message.from, message.text, clientId, supabase, windowExpiresAt);
          } catch (err) {
            Sentry.captureException(err, { extra: { fromNumber: message.from } });
            console.error("[WhatsApp reply] Unhandled error:", err);
          }
        });
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json({ success: true }, { status: 200 });
  }
}

const WA_SYSTEM_PROMPT =
  "You are Emma, a concise AI assistant replying via WhatsApp. " +
  "Keep responses brief (1-3 short paragraphs). Plain text only — no markdown headers or bold.";

async function checkWhatsAppSenderRateLimit(fromNumber: string, clientId: string | null) {
  const senderHash = crypto.createHash("sha256").update(fromNumber).digest("hex");
  return checkDistributedRateLimit({
    key: `${clientId ?? "unknown"}:${senderHash}`,
    namespace: "whatsapp_sender",
    limit: WHATSAPP_SENDER_RATE_LIMIT,
    windowSeconds: WHATSAPP_SENDER_RATE_WINDOW_SECONDS,
  });
}

async function replyToWhatsApp(
  fromNumber: string,
  inboundText: string,
  clientId: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  windowExpiresAt: string
): Promise<void> {
  const sanitised = sanitiseInput(inboundText);
  if (sanitised.blocked) {
    console.warn("[WhatsApp reply] Blocked injection attempt from", fromNumber);
    return;
  }
  const safeText = sanitised.clean;

  try {
    const senderLimit = await checkWhatsAppSenderRateLimit(fromNumber, clientId);
    if (!senderLimit.allowed) {
      console.warn("[WhatsApp reply] Sender rate limited");
      return;
    }
  } catch (err) {
    Sentry.captureException(err);
    console.error("[WhatsApp reply] Sender rate limit unavailable");
    return;
  }

  // Load last 15 messages for this number (oldest first after reverse)
  const { data: history } = await supabase
    .from("ingested_whatsapp")
    .select("direction, body, received_at")
    .eq("from_number", fromNumber)
    .order("received_at", { ascending: false })
    .limit(15);

  const messages: Array<{ role: string; content: string }> = (
    (history as Array<{ direction: string; body: string }>) || []
  )
    .reverse()
    .map((row) => ({
      role: row.direction === "outbound" ? "assistant" : "user",
      content: row.body || "",
    }))
    .filter((m) => m.content);

  // Guarantee the current inbound is the last user turn
  if (!messages.length || messages[messages.length - 1].content !== safeText) {
    messages.push({ role: "user", content: safeText });
  }

  let replyText = "";
  try {
    const cost = await enforceCostGate({ operation: "whatsapp_ingest", clientId });
    if (!cost.allowed) return;
    const llmRes = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: openRouterHeaders(),
      body: JSON.stringify({
        models: UTILITY_MODELS,
        max_tokens: 400,
        messages: [{ role: "system", content: WA_SYSTEM_PROMPT }, ...messages],
      }),
    });
    if (llmRes.ok) {
      const data = await llmRes.json();
      await recordCostResult(cost, { ...extractUsage(data), success: true });
      replyText = extractText(data).trim();
    } else {
      await recordCostResult(cost, { success: false });
      console.error("[WhatsApp reply] LLM error:", llmRes.status);
    }
  } catch (err) {
    console.error("[WhatsApp reply] LLM fetch error:", err);
  }

  if (!replyText) return;

  const sendResult = await adapter.sendText(fromNumber, replyText);
  if (!sendResult.success) {
    console.error("[WhatsApp reply] Send failed:", sendResult.output);
    return;
  }

  const outboundWamid = (sendResult.data as { messageId?: string })?.messageId ?? null;
  if (outboundWamid) {
    await supabase.from("ingested_whatsapp").upsert(
      {
        from_number: fromNumber,
        message_id: outboundWamid,
        body: replyText,
        received_at: new Date().toISOString(),
        direction: "outbound",
        outbound_wamid: outboundWamid,
        window_expires_at: windowExpiresAt,
        ...(clientId ? { client_id: clientId } : {}),
      },
      { onConflict: "message_id" }
    );
  }
}
