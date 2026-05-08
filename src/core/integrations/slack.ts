/**
 * Slack Adapter — Bot token auth, chat.postMessage.
 * Token stored encrypted in access_token field.
 */

import {
  type IntegrationAdapter,
  type IntegrationService,
  type AdapterResult,
  getIntegrationTokens,
  markIntegrationUsed,
  markIntegrationError,
} from "./adapter";

export class SlackAdapter implements IntegrationAdapter {
  service: IntegrationService = "slack";

  async validate(clientId: string): Promise<boolean> {
    try {
      await getIntegrationTokens(clientId, "slack");
      return true;
    } catch {
      return false;
    }
  }

  async send(clientId: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const { channel, message, thread_ts } = params as {
      channel: string;
      message: string;
      thread_ts?: string;
    };

    try {
      const { accessToken } = await getIntegrationTokens(clientId, "slack");

      const body: Record<string, unknown> = { channel, text: message };
      if (thread_ts) body.thread_ts = thread_ts;

      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        await markIntegrationError(clientId, "slack", new Error(errText));
        return { success: false, output: `Slack HTTP error: ${res.status}` };
      }

      const data = await res.json();
      if (!data.ok) {
        await markIntegrationError(clientId, "slack", new Error(data.error));
        return { success: false, output: `Slack error: ${data.error}` };
      }

      await markIntegrationUsed(clientId, "slack");
      return {
        success: true,
        output: `Message sent to ${channel}`,
        data: { ts: data.ts, channel: data.channel },
      };
    } catch (err: any) {
      await markIntegrationError(clientId, "slack", err);
      return { success: false, output: `Slack failed: ${err.message}` };
    }
  }
}
