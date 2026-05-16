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

  async listChannels(clientId: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const { limit = 100 } = params as { limit?: number };

    try {
      const { accessToken } = await getIntegrationTokens(clientId, "slack");

      const url = new URL("https://slack.com/api/conversations.list");
      url.searchParams.set("types", "public_channel");
      url.searchParams.set("limit", String(Math.min(limit, 200)));
      url.searchParams.set("exclude_archived", "true");

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
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

      const channels: any[] = data.channels || [];
      if (channels.length === 0) {
        return { success: true, output: "No channels found.", data: { channels: [] } };
      }

      const formatted = channels.map((c) => `#${c.name} (ID: ${c.id})`).join("\n");

      await markIntegrationUsed(clientId, "slack");
      return {
        success: true,
        output: `Found ${channels.length} channels:\n${formatted}`,
        data: {
          count: channels.length,
          channels: channels.map((c) => ({ id: c.id, name: c.name })),
        },
      };
    } catch (err: any) {
      await markIntegrationError(clientId, "slack", err);
      return { success: false, output: `Slack list channels failed: ${err.message}` };
    }
  }

  async uploadFile(clientId: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const { channel, filename, content, mime_type = "text/plain" } = params as {
      channel: string;
      filename: string;
      content: string;
      mime_type?: string;
    };

    try {
      const { accessToken } = await getIntegrationTokens(clientId, "slack");
      const headers = { Authorization: `Bearer ${accessToken}` };

      // Step 1: get upload URL
      const urlRes = await fetch("https://slack.com/api/files.getUploadURLExternal", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          filename,
          length: String(Buffer.byteLength(content, "utf8")),
        }),
      });

      const urlData = await urlRes.json();
      if (!urlData.ok) {
        await markIntegrationError(clientId, "slack", new Error(urlData.error));
        return { success: false, output: `Slack upload URL error: ${urlData.error}` };
      }

      // Step 2: upload content to the provided URL
      await fetch(urlData.upload_url, {
        method: "POST",
        headers: { "Content-Type": mime_type },
        body: content,
      });

      // Step 3: complete upload and share to channel
      const completeRes = await fetch("https://slack.com/api/files.completeUploadExternal", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [{ id: urlData.file_id, title: filename }],
          channel_id: channel,
        }),
      });

      const completeData = await completeRes.json();
      if (!completeData.ok) {
        await markIntegrationError(clientId, "slack", new Error(completeData.error));
        return { success: false, output: `Slack complete upload error: ${completeData.error}` };
      }

      await markIntegrationUsed(clientId, "slack");
      return {
        success: true,
        output: `File "${filename}" uploaded to ${channel}`,
        data: { fileId: urlData.file_id, filename, channel },
      };
    } catch (err: any) {
      await markIntegrationError(clientId, "slack", err);
      return { success: false, output: `Slack upload failed: ${err.message}` };
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
