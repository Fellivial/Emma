/**
 * HubSpot Adapter — API key auth, CRM note creation.
 * No OAuth — key stored encrypted in access_token field.
 */

import {
  type IntegrationAdapter,
  type IntegrationService,
  type AdapterResult,
  getIntegrationTokens,
  markIntegrationUsed,
  markIntegrationError,
} from "./adapter";

export class HubSpotAdapter implements IntegrationAdapter {
  service: IntegrationService = "hubspot";

  async validate(clientId: string): Promise<boolean> {
    try {
      await getIntegrationTokens(clientId, "hubspot");
      return true;
    } catch {
      return false;
    }
  }

  async send(clientId: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const { contact_email, note, deal_id } = params as {
      contact_email?: string;
      note: string;
      deal_id?: string;
    };

    try {
      const { accessToken } = await getIntegrationTokens(clientId, "hubspot");

      const body: any = {
        properties: {
          hs_note_body: note,
          hs_timestamp: Date.now().toString(),
        },
        associations: deal_id
          ? [
              {
                to: { id: deal_id },
                types: [
                  {
                    associationCategory: "HUBSPOT_DEFINED",
                    associationTypeId: 214,
                  },
                ],
              },
            ]
          : [],
      };

      const res = await fetch("https://api.hubapi.com/crm/v3/objects/notes", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        await markIntegrationError(clientId, "hubspot", new Error(errText));
        return { success: false, output: `HubSpot API error: ${res.status}` };
      }

      await markIntegrationUsed(clientId, "hubspot");
      return { success: true, output: "CRM note logged" };
    } catch (err: any) {
      await markIntegrationError(clientId, "hubspot", err);
      return { success: false, output: `HubSpot failed: ${err.message}` };
    }
  }
}
