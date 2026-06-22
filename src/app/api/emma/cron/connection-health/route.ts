/**
 * Connection-health cron — every hour.
 *
 * Scans client_integrations for auth_expired connections and connections
 * whose token_expires_at is within 4 hours. For each affected connection,
 * inserts a pattern_detections row (type: "connection_expiry") so the
 * existing patterns endpoint surfaces a Tier-2 re-auth suggestion at the
 * user's next page mount.
 *
 * Dedup: one suggestion per user+service per calendar day.
 * Protected by CRON_SECRET header (same as all other cron routes).
 */

import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 30;

function authOk(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "development") return true;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

const SERVICE_LABELS: Record<string, string> = {
  gmail: "Gmail",
  google_calendar: "Google Calendar",
  google_drive: "Google Drive",
  slack: "Slack",
  notion: "Notion",
  hubspot: "HubSpot",
  elevenlabs: "ElevenLabs",
};

function serviceLabel(service: string): string {
  return SERVICE_LABELS[service] ?? service.replace(/_/g, " ");
}

export async function GET(req: NextRequest) {
  if (!authOk(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "No DB connection" }, { status: 500 });
  }

  return Sentry.withMonitor(
    "emma-cron-connection-health",
    async () => {
      try {
        const now = new Date();
        const in4h = new Date(now.getTime() + 4 * 60 * 60 * 1000);
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);

        // Two separate queries to avoid complex OR filter syntax
        const [{ data: expired }, { data: expiringSoon }] = await Promise.all([
          supabase
            .from("client_integrations")
            .select("client_id, service, status, token_expires_at")
            .eq("status", "auth_expired"),
          supabase
            .from("client_integrations")
            .select("client_id, service, status, token_expires_at")
            .not("token_expires_at", "is", null)
            .lte("token_expires_at", in4h.toISOString())
            .neq("status", "auth_expired")
            .neq("status", "disconnected"),
        ]);

        type IntRow = {
          client_id: string;
          service: string;
          status: string;
          token_expires_at: string | null;
        };
        const all: IntRow[] = [...(expired ?? []), ...(expiringSoon ?? [])] as IntRow[];

        if (all.length === 0) {
          return NextResponse.json({ checked: 0, nudgesCreated: 0, ranAt: now.toISOString() });
        }

        // Resolve client_id → user_id in one round-trip
        const clientIds = [...new Set(all.map((r) => r.client_id))];
        const { data: members } = await supabase
          .from("client_members")
          .select("client_id, user_id")
          .in("client_id", clientIds);

        const clientToUser = new Map<string, string>();
        for (const m of (members ?? []) as Array<{ client_id: string; user_id: string }>) {
          clientToUser.set(m.client_id, m.user_id);
        }

        let nudgesCreated = 0;

        for (const row of all) {
          const userId = clientToUser.get(row.client_id);
          if (!userId) continue;

          const label = serviceLabel(row.service);
          const isExpired = row.status === "auth_expired";
          const descKey = `connection_expiry:${row.service}`;

          // Dedup: skip if a nudge for this service was already created today
          const { count: alreadyCreated } = await supabase
            .from("pattern_detections")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("description", descKey)
            .gte("detected_at", todayStart.toISOString());

          if ((alreadyCreated ?? 0) > 0) continue;

          const suggestion = isExpired
            ? `${label} connection expired — reconnect in Settings → Integrations to keep it working.`
            : `${label} connection expires soon — reconnect in Settings → Integrations to avoid interruption.`;

          await supabase.from("pattern_detections").insert({
            user_id: userId,
            pattern_type: "connection_expiry",
            description: descKey,
            suggestion,
            frequency: 1,
            status: "pending",
            detected_at: now.toISOString(),
          });

          nudgesCreated++;
        }

        return NextResponse.json({
          checked: all.length,
          nudgesCreated,
          ranAt: now.toISOString(),
        });
      } catch (err) {
        Sentry.captureException(err);
        console.error("[connection-health] Unexpected error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      }
    },
    { schedule: { type: "crontab" as const, value: "0 * * * *" } }
  );
}
