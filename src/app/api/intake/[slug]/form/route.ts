import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadClientConfigOrNull } from "@/core/client-config";
import { Resend } from "resend";
import { syncLeadToHubSpot } from "@/lib/hubspot";

// ─── Rate limiting (in-memory, per-IP, per-slug) ───────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, slug: string): boolean {
  const key = `form:${ip}:${slug}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// ─── IP hashing ───────────────────────────────────────────────────────────────

async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Supabase service-role client ─────────────────────────────────────────────

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const config = await loadClientConfigOrNull(slug);
  if (!config || !config.formSteps?.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (!checkRateLimit(ip, slug)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let formData: Record<string, string>;
  let sessionId: string;
  try {
    const body = await request.json();
    formData = body.formData;
    sessionId = body.sessionId;
    if (!formData || typeof formData !== "object" || !sessionId) throw new Error("invalid");
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Validate all required fields across all steps
  for (const step of config.formSteps) {
    for (const field of step.fields) {
      if (field.required && !formData[field.id]?.trim()) {
        return NextResponse.json(
          { error: `Missing required field: ${field.label}` },
          { status: 422 }
        );
      }
    }
  }

  // Build lead from savesTo mappings
  let name = "";
  let contact = "";
  const notesParts: string[] = [];

  for (const step of config.formSteps) {
    for (const field of step.fields) {
      const val = formData[field.id]?.trim() ?? "";
      if (!val) continue;
      if (field.savesTo === "name") {
        name = val;
      } else if (field.savesTo === "contact") {
        contact = val;
      } else {
        notesParts.push(`${field.label}: ${val}`);
      }
    }
  }

  const notes = notesParts.join("\n") || "";

  if (!name && !contact) {
    return NextResponse.json({ error: "Insufficient data" }, { status: 422 });
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const ipHash = await hashIp(ip);
  const { error: dbErr } = await supabase.from("leads").insert({
    client_slug: slug,
    session_id: sessionId,
    name,
    contact,
    notes,
    ip_hash: ipHash,
  });

  if (dbErr) {
    console.error("[intake/form] lead insert failed", dbErr);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  // HubSpot sync (non-fatal)
  syncLeadToHubSpot(supabase, config.id, { name, contact, notes }).catch(() => {});

  // Email notification (non-fatal)
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.EMAIL_FROM ?? "noreply@example.com";
  if (resendKey) {
    try {
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: fromEmail,
        to: fromEmail,
        subject: `New lead — ${config.name}`,
        text: [
          `New intake lead for ${config.name}`,
          `Name: ${name}`,
          `Contact: ${contact}`,
          `Notes: ${notes}`,
          `Time: ${new Date().toISOString()}`,
        ].join("\n"),
      });
    } catch (emailErr) {
      console.error("[intake/form] email send failed", emailErr);
    }
  }

  return NextResponse.json({ ok: true });
}
