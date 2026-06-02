/**
 * HubSpot Adapter — API key auth, CRM note creation.
 * No OAuth — key stored encrypted in access_token field.
 *
 * All API calls are wrapped with callWithTokenRefresh so 401 errors
 * automatically mark the integration expired and surface a clear message
 * asking the user to re-enter their API key.
 */

import {
  type IntegrationAdapter,
  type IntegrationService,
  type AdapterResult,
  markIntegrationUsed,
  markIntegrationError,
} from "./adapter";
import { callWithTokenRefresh, IntegrationExpiredError } from "@/lib/oauth-refresh";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatDeal(d: any): string {
  const p = d.properties || {};
  return `Deal: ${p.dealname || "(unnamed)"}\nAmount: ${p.amount || "N/A"}\nStage: ${p.dealstage || "N/A"}`;
}

export class HubSpotAdapter implements IntegrationAdapter {
  service: IntegrationService = "hubspot";

  async validate(clientId: string): Promise<boolean> {
    try {
      // Attempt a lightweight contacts fetch to confirm the token is valid.
      await callWithTokenRefresh(clientId, "hubspot", (token) =>
        fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=1&properties=firstname", {
          headers: { Authorization: `Bearer ${token}` },
        })
      );
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

      const res = await callWithTokenRefresh(clientId, "hubspot", (token) =>
        fetch("https://api.hubapi.com/crm/v3/objects/deals", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      );

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err instanceof IntegrationExpiredError) {
        return { success: false, output: "HubSpot requires re-authorization" };
      }
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
      const properties: Record<string, string> = { dealstage };
      if (amount) properties.amount = amount;

      const res = await callWithTokenRefresh(clientId, "hubspot", (token) =>
        fetch(`https://api.hubapi.com/crm/v3/objects/deals/${deal_id}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ properties }),
        })
      );

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err instanceof IntegrationExpiredError) {
        return { success: false, output: "HubSpot requires re-authorization" };
      }
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
      const res = await callWithTokenRefresh(clientId, "hubspot", (token) => {
        if (query) {
          return fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              query,
              limit: Math.min(limit, 100),
              properties: ["firstname", "lastname", "email", "company"],
            }),
          });
        }
        return fetch(
          `https://api.hubapi.com/crm/v3/objects/contacts?limit=${Math.min(limit, 100)}&properties=firstname,lastname,email,company`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      });

      if (!res.ok) {
        const errText = await res.text();
        await markIntegrationError(clientId, "hubspot", new Error(errText));
        return { success: false, output: `HubSpot API error: ${res.status}` };
      }

      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err instanceof IntegrationExpiredError) {
        return { success: false, output: "HubSpot requires re-authorization" };
      }
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
      const res = await callWithTokenRefresh(clientId, "hubspot", (token) => {
        if (stage) {
          return fetch("https://api.hubapi.com/crm/v3/objects/deals/search", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              filterGroups: [
                { filters: [{ propertyName: "dealstage", operator: "EQ", value: stage }] },
              ],
              properties: ["dealname", "amount", "dealstage"],
              limit: Math.min(limit, 100),
            }),
          });
        }
        return fetch(
          `https://api.hubapi.com/crm/v3/objects/deals?limit=${Math.min(limit, 100)}&properties=dealname,amount,dealstage`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      });

      if (!res.ok) {
        const errText = await res.text();
        await markIntegrationError(clientId, "hubspot", new Error(errText));
        return { success: false, output: `HubSpot API error: ${res.status}` };
      }

      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const deals: any[] = data.results || [];

      if (deals.length === 0) {
        return { success: true, output: "No deals found.", data: { deals: [] } };
      }

      const formatted = deals.map(formatDeal).join("\n\n");
      await markIntegrationUsed(clientId, "hubspot");
      return { success: true, output: formatted, data: { count: deals.length, deals } };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err instanceof IntegrationExpiredError) {
        return { success: false, output: "HubSpot requires re-authorization" };
      }
      await markIntegrationError(clientId, "hubspot", err);
      return { success: false, output: `HubSpot get deals failed: ${err.message}` };
    }
  }

  async getContactById(clientId: string, contactId: string): Promise<AdapterResult> {
    try {
      const res = await callWithTokenRefresh(clientId, "hubspot", (token) =>
        fetch(
          `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}?properties=firstname,lastname,email,company,phone,jobtitle,website`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err instanceof IntegrationExpiredError) {
        return { success: false, output: "HubSpot requires re-authorization" };
      }
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: any = {
        properties: {
          hs_note_body: note,
          hs_timestamp: Date.now().toString(),
        },
        associations: deal_id
          ? [
              {
                to: { id: deal_id },
                types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 214 }],
              },
            ]
          : [],
      };

      const res = await callWithTokenRefresh(clientId, "hubspot", (token) =>
        fetch("https://api.hubapi.com/crm/v3/objects/notes", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      );

      if (!res.ok) {
        const errText = await res.text();
        await markIntegrationError(clientId, "hubspot", new Error(errText));
        return { success: false, output: `HubSpot API error: ${res.status}` };
      }

      await markIntegrationUsed(clientId, "hubspot");
      return { success: true, output: "CRM note logged" };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err instanceof IntegrationExpiredError) {
        return { success: false, output: "HubSpot requires re-authorization" };
      }
      await markIntegrationError(clientId, "hubspot", err);
      return { success: false, output: `HubSpot failed: ${err.message}` };
    }
  }
}
