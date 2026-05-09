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

  async createDeal(clientId: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const { dealname, amount, pipeline, dealstage, contact_id } = params as {
      dealname: string;
      amount?: string;
      pipeline?: string;
      dealstage?: string;
      contact_id?: string;
    };

    try {
      const { accessToken } = await getIntegrationTokens(clientId, "hubspot");

      const properties: Record<string, string> = { dealname };
      if (amount) properties.amount = amount;
      if (pipeline) properties.pipeline = pipeline;
      if (dealstage) properties.dealstage = dealstage;

      const body: Record<string, unknown> = { properties };
      if (contact_id) {
        body.associations = [
          {
            to: { id: contact_id },
            // 3 = HUBSPOT_DEFINED contact-to-deal association type
            types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }],
          },
        ];
      }

      const res = await fetch("https://api.hubapi.com/crm/v3/objects/deals", {
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

      const data = await res.json();
      await markIntegrationUsed(clientId, "hubspot");
      return {
        success: true,
        output: `Deal "${dealname}" created (ID: ${data.id})`,
        data: { dealId: data.id, dealname },
      };
    } catch (err: any) {
      await markIntegrationError(clientId, "hubspot", err);
      return { success: false, output: `HubSpot create deal failed: ${err.message}` };
    }
  }

  async updateDealStage(clientId: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const { deal_id, dealstage, amount } = params as {
      deal_id: string;
      dealstage: string;
      amount?: string;
    };

    if (!/^\d+$/.test(deal_id)) {
      return { success: false, output: "Invalid deal ID — must be numeric." };
    }

    try {
      const { accessToken } = await getIntegrationTokens(clientId, "hubspot");

      const properties: Record<string, string> = { dealstage };
      if (amount) properties.amount = amount;

      const res = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${deal_id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ properties }),
      });

      if (!res.ok) {
        const errText = await res.text();
        await markIntegrationError(clientId, "hubspot", new Error(errText));
        return { success: false, output: `HubSpot API error: ${res.status}` };
      }

      await markIntegrationUsed(clientId, "hubspot");
      return {
        success: true,
        output: `Deal ${deal_id} stage updated to "${dealstage}"`,
        data: { dealId: deal_id, dealstage },
      };
    } catch (err: any) {
      await markIntegrationError(clientId, "hubspot", err);
      return { success: false, output: `HubSpot update deal failed: ${err.message}` };
    }
  }

  async send(clientId: string, params: Record<string, unknown>): Promise<AdapterResult> {
    const { note, deal_id } = params as {
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
