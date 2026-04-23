import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runAgentLoop, type AgentTask } from "@/core/agent-loop";
import { checkRateLimit, consumeRateLimit } from "@/core/rate-limiter";
import * as crypto from "crypto";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Webhook Receiver
 *
 * POST /api/emma/webhook?id=<endpoint_id>
 *
 * Flow:
 *   1. Look up webhook endpoint by ID
 *   2. Verify HMAC signature (X-Emma-Signature header)
 *   3. Check rate limit for client
 *   4. Map event data to workflow via template
 *   5. Run agent loop with mapped goal + context
 *   6. Return result
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "DB not configured" }, { status: 501 });
  }

  try {
    const endpointId = req.nextUrl.searchParams.get("id");
    if (!endpointId) {
      return NextResponse.json({ error: "Missing endpoint ID" }, { status: 400 });
    }

    // ── Look up webhook endpoint ─────────────────────────────────────────
    const { data: endpoint, error: lookupErr } = await supabase
      .from("webhook_endpoints")
      .select("*, clients(id, slug)")
      .eq("id", endpointId)
      .eq("enabled", true)
      .single();

    if (lookupErr || !endpoint) {
      return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
    }

    // ── Verify HMAC signature ────────────────────────────────────────────
    const body = await req.text();
    const signature = req.headers.get("x-emma-signature") || req.headers.get("x-webhook-signature");

    if (signature) {
      const expected = crypto
        .createHmac("sha256", endpoint.secret)
        .update(body)
        .digest("hex");

      const sigValue = signature.startsWith("sha256=") ? signature.slice(7) : signature;

      if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sigValue))) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    // ── Rate limit check ─────────────────────────────────────────────────
    const clientId = endpoint.client_id;
    const rateCheck = checkRateLimit(clientId);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          reason: rateCheck.reason,
          resetsAt: new Date(rateCheck.resetsAt).toISOString(),
        },
        { status: 429 }
      );
    }

    // ── Parse event data ─────────────────────────────────────────────────
    let eventData: Record<string, unknown>;
    try {
      eventData = JSON.parse(body);
    } catch {
      eventData = { raw: body };
    }

    // ── Map event to workflow goal ───────────────────────────────────────
    const goal = buildGoalFromEvent(
      endpoint.event_type,
      endpoint.workflow,
      endpoint.workflow_input_template,
      eventData
    );

    // ── Run agent loop ───────────────────────────────────────────────────
    const taskId = `wh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const task: AgentTask = {
      id: taskId,
      goal: goal,
      context: `Triggered by webhook: ${endpoint.event_type}. Event data: ${JSON.stringify(eventData).slice(0, 500)}`,
      userId: "system",
      clientId: clientId,
      maxSteps: 5,
      triggerType: "webhook",
      triggerSource: `webhook:${endpointId}`,
    };

    const result = await runAgentLoop(task);

    // ── Track rate limit ─────────────────────────────────────────────────
    consumeRateLimit(clientId, 1, result.totalTokens);

    return NextResponse.json({
      taskId: result.taskId,
      status: result.status,
      steps: result.steps.length,
      totalTokens: result.totalTokens,
    });
  } catch (err) {
    console.error("[Webhook] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * Build a goal string from event data + template.
 */
function buildGoalFromEvent(
  eventType: string,
  workflow: string,
  template: Record<string, unknown> | null,
  eventData: Record<string, unknown>
): string {
  // Default goal based on event type
  const defaultGoals: Record<string, string> = {
    form_submission: `A new form submission was received. Process and respond to the submission data.`,
    new_email: `A new email was received. Read, summarize, and determine if any action is needed.`,
    appointment_reminder: `An appointment reminder was triggered. Notify the user and prepare any relevant context.`,
    system_alert: `A system alert was triggered. Assess the situation and take appropriate action.`,
    data_update: `External data was updated. Process the changes and update any relevant records.`,
  };

  // If template has a goal field, use it
  if (template && typeof template.goal === "string") {
    // Simple template variable substitution: {{key}} → eventData[key]
    let goal = template.goal as string;
    for (const [key, value] of Object.entries(eventData)) {
      goal = goal.replace(`{{${key}}}`, String(value));
    }
    return goal;
  }

  return defaultGoals[eventType] || `Process ${eventType} event for workflow "${workflow}".`;
}
