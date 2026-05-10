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

function formatDeal(d: any): string {
  const p = d.properties || {};
  return `Deal: ${p.dealname || "(unnamed)"}\nAmount: ${p.amount || "N/A"}\nStage: ${p.dealstage || "N/A"}`;
}

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

  async getContacts(
    clientId: string,
    params: { limit?: number; query?: string }
  ): Promise<AdapterResult> {
    const { limit = 10, query } = params;
    try {
      const { accessToken } = await getIntegrationTokens(clientId, "hubspot");
      let res: Response;

      if (query) {
        res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query,
            limit: Math.min(limit, 100),
            properties: ["firstname", "lastname", "email", "company"],
          }),
        });
      } else {
        res = await fetch(
          `https://api.hubapi.com/crm/v3/objects/contacts?limit=${Math.min(limit, 100)}&properties=firstname,lastname,email,company`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
      }

      if (!res.ok) {
        const errText = await res.text();
        await markIntegrationError(clientId, "hubspot", new Error(errText));
        return { success: false, output: `HubSpot API error: ${res.status}` };
      }

      const data = await res.json();
      const contacts: any[] = data.results || [];

      if (contacts.length === 0) {
        return { success: true, output: "No contacts found.", data: { contacts: [] } };
      }

      const formatted = contacts
        .map((c) => {
          const p = c.properties || {};
          return `Contact: ${p.firstname || ""} ${p.lastname || ""}\nEmail: ${p.email || "N/A"}\nCompany: ${p.company || "N/A"}`;
        })
        .join("\n\n");

      await markIntegrationUsed(clientId, "hubspot");
      return { success: true, output: formatted, data: { count: contacts.length, contacts } };
    } catch (err: any) {
      await markIntegrationError(clientId, "hubspot", err);
      return { success: false, output: `HubSpot get contacts failed: ${err.message}` };
    }
  }

  async getDeals(
    clientId: string,
    params: { limit?: number; stage?: string }
  ): Promise<AdapterResult> {
    const { limit = 10, stage } = params;
    try {
      const { accessToken } = await getIntegrationTokens(clientId, "hubspot");
      let res: Response;

      if (stage) {
        res = await fetch("https://api.hubapi.com/crm/v3/objects/deals/search", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filterGroups: [
              { filters: [{ propertyName: "dealstage", operator: "EQ", value: stage }] },
            ],
            properties: ["dealname", "amount", "dealstage"],
            limit: Math.min(limit, 100),
          }),
        });
      } else {
        res = await fetch(
          `https://api.hubapi.com/crm/v3/objects/deals?limit=${Math.min(limit, 100)}&properties=dealname,amount,dealstage`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
      }

      if (!res.ok) {
        const errText = await res.text();
        await markIntegrationError(clientId, "hubspot", new Error(errText));
        return { success: false, output: `HubSpot API error: ${res.status}` };
      }

      const data = await res.json();
      const deals: any[] = data.results || [];

      if (deals.length === 0) {
        return { success: true, output: "No deals found.", data: { deals: [] } };
      }

      const formatted = deals.map(formatDeal).join("\n\n");
      await markIntegrationUsed(clientId, "hubspot");
      return { success: true, output: formatted, data: { count: deals.length, deals } };
    } catch (err: any) {
      await markIntegrationError(clientId, "hubspot", err);
      return { success: false, output: `HubSpot get deals failed: ${err.message}` };
    }
  }

  async getContactById(clientId: string, contactId: string): Promise<AdapterResult> {
    try {
      const { accessToken } = await getIntegrationTokens(clientId, "hubspot");

      const res = await fetch(
        `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}?properties=firstname,lastname,email,company,phone,jobtitle,website`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!res.ok) {
        const errText = await res.text();
        await markIntegrationError(clientId, "hubspot", new Error(errText));
        return { success: false, output: `HubSpot API error: ${res.status}` };
      }

      const data = await res.json();
      const p = data.properties || {};
      const formatted = [
        `Contact: ${p.firstname || ""} ${p.lastname || ""}`,
        `Email: ${p.email || "N/A"}`,
        `Company: ${p.company || "N/A"}`,
        `Phone: ${p.phone || "N/A"}`,
        `Job Title: ${p.jobtitle || "N/A"}`,
        `Website: ${p.website || "N/A"}`,
      ].join("\n");

      await markIntegrationUsed(clientId, "hubspot");
      return {
        success: true,
        output: formatted,
        data: { contactId: data.id, properties: data.properties },
      };
    } catch (err: any) {
      await markIntegrationError(clientId, "hubspot", err);
      return { success: false, output: `HubSpot get contact failed: ${err.message}` };
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
