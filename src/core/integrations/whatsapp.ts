import type { AdapterResult } from "./adapter";

const GRAPH_API_VERSION = "v18.0";

export class WhatsAppAdapter {
  private getConfig(): { accessToken: string | undefined; phoneNumberId: string | undefined } {
    return {
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    };
  }

  async sendText(to: string, message: string): Promise<AdapterResult> {
    const { accessToken, phoneNumberId } = this.getConfig();
    if (!accessToken || !phoneNumberId) {
      return {
        success: false,
        output:
          "WhatsApp not configured. Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID to environment.",
      };
    }
    try {
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body: message },
          }),
        }
      );
      if (!res.ok) {
        const errText = await res.text();
        return {
          success: false,
          output: `WhatsApp API error ${res.status}: ${errText.slice(0, 200)}`,
        };
      }
      const data = await res.json();
      const msgId = data.messages?.[0]?.id || "unknown";
      return {
        success: true,
        output: `WhatsApp message sent (ID: ${msgId})`,
        data: { messageId: msgId },
      };
    } catch (err: any) {
      return { success: false, output: `WhatsApp send failed: ${err.message}` };
    }
  }

  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string
  ): Promise<AdapterResult> {
    const { accessToken, phoneNumberId } = this.getConfig();
    if (!accessToken || !phoneNumberId) {
      return {
        success: false,
        output:
          "WhatsApp not configured. Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID to environment.",
      };
    }
    try {
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "template",
            template: { name: templateName, language: { code: languageCode } },
          }),
        }
      );
      if (!res.ok) {
        const errText = await res.text();
        return {
          success: false,
          output: `WhatsApp API error ${res.status}: ${errText.slice(0, 200)}`,
        };
      }
      const data = await res.json();
      const msgId = data.messages?.[0]?.id || "unknown";
      return {
        success: true,
        output: `WhatsApp template sent (ID: ${msgId})`,
        data: { messageId: msgId },
      };
    } catch (err: any) {
      return { success: false, output: `WhatsApp template send failed: ${err.message}` };
    }
  }

  parseInboundWebhook(payload: unknown): {
    from: string;
    messageId: string;
    text: string;
    timestamp: string;
  } | null {
    try {
      const p = payload as any;
      const message = p?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (!message) return null;
      return {
        from: message.from || "",
        messageId: message.id || "",
        text: message.text?.body || "",
        timestamp: message.timestamp
          ? new Date(Number(message.timestamp) * 1000).toISOString()
          : new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
}
