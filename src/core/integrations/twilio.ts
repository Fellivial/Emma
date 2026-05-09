/**
 * Twilio Adapter — SMS + WhatsApp via Twilio REST API.
 * Auth: server-side env vars (no per-client token).
 */

import type { AdapterResult } from "./adapter";

function getTwilioCredentials(): { accountSid: string; authToken: string } {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)");
  }
  return { accountSid, authToken };
}

async function twilioPost(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  body: string
): Promise<AdapterResult> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    return { success: false, output: `Twilio API error ${res.status}: ${errText.slice(0, 200)}` };
  }

  const data = await res.json();
  return { success: true, output: `Message sent (SID: ${data.sid})`, data: { sid: data.sid } };
}

export class TwilioAdapter {
  async sendSms(params: Record<string, unknown>): Promise<AdapterResult> {
    const { to, message } = params as { to: string; message: string };
    try {
      const { accountSid, authToken } = getTwilioCredentials();
      const from = process.env.TWILIO_PHONE_NUMBER;
      if (!from) throw new Error("TWILIO_PHONE_NUMBER not configured");
      return await twilioPost(accountSid, authToken, from, to, message);
    } catch (err: any) {
      return { success: false, output: `SMS failed: ${err.message}` };
    }
  }

  async sendWhatsApp(params: Record<string, unknown>): Promise<AdapterResult> {
    const { to, message } = params as { to: string; message: string };
    try {
      const { accountSid, authToken } = getTwilioCredentials();
      const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;
      if (!fromNumber) throw new Error("TWILIO_WHATSAPP_NUMBER not configured");
      return await twilioPost(
        accountSid,
        authToken,
        `whatsapp:${fromNumber}`,
        `whatsapp:${to}`,
        message
      );
    } catch (err: any) {
      return { success: false, output: `WhatsApp failed: ${err.message}` };
    }
  }
}
