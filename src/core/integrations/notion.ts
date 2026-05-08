/**
 * Notion Adapter — Bearer token auth, pages API v1.
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

export class NotionAdapter implements IntegrationAdapter {
  service: IntegrationService = "notion";

  async validate(clientId: string): Promise<boolean> {
    try {
      await getIntegrationTokens(clientId, "notion");
      return true;
    } catch {
      return false;
    }
  }

  async send(clientId: string, params: Record<string, unknown>): Promise<AdapterResult> {
    return this.createPage(clientId, params);
  }

  async createPage(clientId: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const { parent_page_id, title, content } = params as {
      parent_page_id: string;
      title: string;
      content?: string;
    };

    try {
      const { accessToken } = await getIntegrationTokens(clientId, "notion");

      const body: Record<string, unknown> = {
        parent: { page_id: parent_page_id },
        properties: {
          title: { title: [{ text: { content: title } }] },
        },
      };

      if (content) {
        body.children = [
          {
            object: "block",
            type: "paragraph",
            paragraph: { rich_text: [{ type: "text", text: { content } }] },
          },
        ];
      }

      const res = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        await markIntegrationError(clientId, "notion", new Error(errText));
        return { success: false, output: `Notion API error: ${res.status}` };
      }

      const data = await res.json();
      await markIntegrationUsed(clientId, "notion");
      return {
        success: true,
        output: `Page "${title}" created`,
        data: { pageId: data.id, url: data.url },
      };
    } catch (err: any) {
      await markIntegrationError(clientId, "notion", err);
      return { success: false, output: `Notion failed: ${err.message}` };
    }
  }

  async updatePage(clientId: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const { page_id, title, content } = params as {
      page_id: string;
      title?: string;
      content?: string;
    };

    try {
      const { accessToken } = await getIntegrationTokens(clientId, "notion");
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      };

      if (title) {
        const patchRes = await fetch(`https://api.notion.com/v1/pages/${page_id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            properties: { title: { title: [{ text: { content: title } }] } },
          }),
        });

        if (!patchRes.ok) {
          const errText = await patchRes.text();
          await markIntegrationError(clientId, "notion", new Error(errText));
          return { success: false, output: `Notion API error: ${patchRes.status}` };
        }
      }

      if (content) {
        const blockRes = await fetch(`https://api.notion.com/v1/blocks/${page_id}/children`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            children: [
              {
                object: "block",
                type: "paragraph",
                paragraph: { rich_text: [{ type: "text", text: { content } }] },
              },
            ],
          }),
        });

        if (!blockRes.ok) {
          const errText = await blockRes.text();
          await markIntegrationError(clientId, "notion", new Error(errText));
          return { success: false, output: `Notion block error: ${blockRes.status}` };
        }
      }

      await markIntegrationUsed(clientId, "notion");
      return { success: true, output: `Page ${page_id} updated` };
    } catch (err: any) {
      await markIntegrationError(clientId, "notion", err);
      return { success: false, output: `Notion update failed: ${err.message}` };
    }
  }
}
