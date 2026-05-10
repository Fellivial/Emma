/**
 * Google Integrations — Gmail (send) + Google Calendar (create event).
 *
 * Uses native fetch for all HTTP calls (no google-auth-library).
 * Tokens encrypted at rest via AES-256-GCM.
 */

import { createClient } from "@supabase/supabase-js";
import { encrypt, decrypt } from "@/core/security/encryption";
import {
  type IntegrationAdapter,
  type IntegrationService,
  type AdapterResult,
  IntegrationNotConfiguredError,
  IntegrationAuthExpiredError,
  getIntegrationTokens,
  markIntegrationUsed,
  markIntegrationError,
  markIntegrationExpired,
} from "./adapter";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ─── Token Refresh ───────────────────────────────────────────────────────────

async function refreshGoogleToken(clientId: string, service: IntegrationService): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new IntegrationAuthExpiredError(service);

  const { data: row } = await supabase
    .from("client_integrations")
    .select("refresh_token")
    .eq("client_id", clientId)
    .eq("service", service)
    .single();

  if (!row?.refresh_token) throw new IntegrationAuthExpiredError(service);

  const refreshToken = decrypt(row.refresh_token);
  const clientIdEnv = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientIdEnv || !clientSecret) throw new IntegrationAuthExpiredError(service);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientIdEnv,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    await markIntegrationExpired(clientId, service);
    throw new IntegrationAuthExpiredError(service);
  }

  const data = await res.json();
  const newAccessToken = data.access_token;
  const expiresIn = data.expires_in || 3600;

  await supabase
    .from("client_integrations")
    .update({
      access_token: encrypt(newAccessToken),
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      status: "connected",
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", clientId)
    .eq("service", service);

  return newAccessToken;
}

// Helper: get token with auto-refresh
async function getTokenWithRefresh(clientId: string, service: IntegrationService): Promise<string> {
  try {
    const { accessToken } = await getIntegrationTokens(clientId, service);
    return accessToken;
  } catch (err) {
    if (err instanceof IntegrationAuthExpiredError) {
      return refreshGoogleToken(clientId, service);
    }
    throw err;
  }
}

// Helper: make authenticated request with retry on 401
async function googleFetch(
  clientId: string,
  service: IntegrationService,
  url: string,
  options: RequestInit
): Promise<Response> {
  let token = await getTokenWithRefresh(clientId, service);

  let res = await fetch(url, {
    ...options,
    headers: { ...(options.headers as any), Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    token = await refreshGoogleToken(clientId, service);
    res = await fetch(url, {
      ...options,
      headers: { ...(options.headers as any), Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) throw new IntegrationAuthExpiredError(service);
  }

  return res;
}

// ─── Gmail Adapter ───────────────────────────────────────────────────────────

export class GmailAdapter implements IntegrationAdapter {
  service: IntegrationService = "gmail";

  async validate(clientId: string): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { data } = await supabase
      .from("client_integrations")
      .select("status")
      .eq("client_id", clientId)
      .eq("service", "gmail")
      .single();
    return data?.status === "connected";
  }

  async send(clientId: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const { to, subject, body } = params as { to: string; subject: string; body: string };

    try {
      // Get sender email from account_identifier
      const supabase = getSupabase();
      let fromEmail = "me";
      if (supabase) {
        const { data } = await supabase
          .from("client_integrations")
          .select("account_identifier")
          .eq("client_id", clientId)
          .eq("service", "gmail")
          .single();
        if (data?.account_identifier) fromEmail = data.account_identifier;
      }

      // Build RFC 2822 MIME message
      const mime = [
        `From: ${fromEmail}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `Content-Type: text/plain; charset=utf-8`,
        "",
        body,
      ].join("\r\n");

      // Base64url encode
      const raw = Buffer.from(mime)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const res = await googleFetch(
        clientId,
        "gmail",
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raw }),
        }
      );

      if (!res.ok) {
        const err = await res.text();
        await markIntegrationError(clientId, "gmail", new Error(err));
        return { success: false, output: `Gmail API error: ${res.status}` };
      }

      await markIntegrationUsed(clientId, "gmail");
      return { success: true, output: `Email sent to ${to}` };
    } catch (err: any) {
      if (err instanceof IntegrationAuthExpiredError) throw err;
      await markIntegrationError(clientId, "gmail", err);
      return { success: false, output: `Email failed: ${err.message}` };
    }
  }
}

// ─── Google Calendar Adapter ─────────────────────────────────────────────────

export class GoogleCalendarAdapter implements IntegrationAdapter {
  service: IntegrationService = "google_calendar";

  async validate(clientId: string): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { data } = await supabase
      .from("client_integrations")
      .select("status")
      .eq("client_id", clientId)
      .eq("service", "google_calendar")
      .single();
    return data?.status === "connected";
  }

  async send(clientId: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const {
      title,
      date,
      time,
      duration_minutes = 60,
      attendees,
    } = params as {
      title: string;
      date: string;
      time: string;
      duration_minutes?: number;
      attendees?: string[];
    };

    try {
      // Build ISO datetime
      const startStr = `${date}T${time || "09:00"}:00`;
      const start = new Date(startStr);
      const end = new Date(start.getTime() + (duration_minutes as number) * 60 * 1000);

      const event = {
        summary: title,
        start: { dateTime: start.toISOString(), timeZone: "UTC" },
        end: { dateTime: end.toISOString(), timeZone: "UTC" },
        attendees: (attendees || []).map((email: string) => ({ email })),
      };

      const res = await googleFetch(
        clientId,
        "google_calendar",
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(event),
        }
      );

      if (!res.ok) {
        const err = await res.text();
        await markIntegrationError(clientId, "google_calendar", new Error(err));
        return { success: false, output: `Calendar API error: ${res.status}` };
      }

      const created = await res.json();
      await markIntegrationUsed(clientId, "google_calendar");

      return {
        success: true,
        output: `Event created: "${title}" on ${date}`,
        data: { eventId: created.id, htmlLink: created.htmlLink },
      };
    } catch (err: any) {
      if (err instanceof IntegrationAuthExpiredError) throw err;
      await markIntegrationError(clientId, "google_calendar", err);
      return { success: false, output: `Calendar failed: ${err.message}` };
    }
  }

  async getUpcomingEvents(
    clientId: string,
    params: {
      maxResults?: number;
      timeMin?: string;
      timeMax?: string;
      calendarId?: string;
    }
  ): Promise<AdapterResult> {
    const {
      maxResults = 10,
      timeMin = new Date().toISOString(),
      timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      calendarId = "primary",
    } = params;

    try {
      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
      );
      url.searchParams.set("timeMin", timeMin);
      url.searchParams.set("timeMax", timeMax);
      url.searchParams.set("maxResults", String(maxResults));
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");

      const res = await googleFetch(clientId, "google_calendar", url.toString(), {
        method: "GET",
      });

      if (!res.ok) {
        const err = await res.text();
        await markIntegrationError(clientId, "google_calendar", new Error(err));
        return { success: false, output: `Calendar API error: ${res.status}` };
      }

      const data = await res.json();
      const events: any[] = data.items || [];

      if (events.length === 0) {
        return { success: true, output: "No upcoming events found.", data: { events: [] } };
      }

      const formatted = events
        .map(
          (e) =>
            `Event: ${e.summary || "(no title)"}\nWhen: ${e.start?.dateTime || e.start?.date || "?"}\nWhere: ${e.location || "N/A"}`
        )
        .join("\n\n");

      await markIntegrationUsed(clientId, "google_calendar");
      return {
        success: true,
        output: formatted,
        data: { count: events.length, events },
      };
    } catch (err: any) {
      if (err instanceof IntegrationAuthExpiredError) throw err;
      await markIntegrationError(clientId, "google_calendar", err);
      return { success: false, output: `Calendar read failed: ${err.message}` };
    }
  }

  async getTodayEvents(clientId: string): Promise<AdapterResult> {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return this.getUpcomingEvents(clientId, {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      maxResults: 20,
    });
  }
}
