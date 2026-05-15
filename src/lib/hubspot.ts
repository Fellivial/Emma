import { decrypt } from "@/core/security/encryption";

interface HubSpotLead {
  name: string;
  contact: string;
  notes: string;
}

/**
 * Sync a captured intake lead to HubSpot as a contact + deal.
 * Non-fatal — caller must wrap in try/catch or ignore return value.
 *
 * Requires the client to have a connected HubSpot integration in
 * client_integrations (service = "hubspot", status = "connected").
 * The access_token is a HubSpot private app token stored encrypted.
 */
export async function syncLeadToHubSpot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  clientId: string,
  lead: HubSpotLead
): Promise<void> {
  const { data: integration } = await supabase
    .from("client_integrations")
    .select("access_token")
    .eq("client_id", clientId)
    .eq("service", "hubspot")
    .eq("status", "connected")
    .single();

  if (!integration?.access_token) return;

  const token = decrypt(integration.access_token);
  if (!token || token.startsWith("[")) return;

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // Create contact
  const nameParts = lead.name.trim().split(/\s+/);
  const firstname = nameParts[0];
  const lastname = nameParts.slice(1).join(" ") || "";
  const isEmail = lead.contact.includes("@");

  const contactRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
    method: "POST",
    headers,
    body: JSON.stringify({
      properties: {
        firstname,
        lastname,
        ...(isEmail ? { email: lead.contact } : { phone: lead.contact }),
        hs_lead_status: "NEW",
      },
    }),
  });

  if (!contactRes.ok) {
    console.error("[hubspot] contact creation failed", contactRes.status, await contactRes.text());
    return;
  }

  const contactData = await contactRes.json();
  const contactId = contactData.id as string;

  // Create deal associated to the contact
  const dealRes = await fetch("https://api.hubapi.com/crm/v3/objects/deals", {
    method: "POST",
    headers,
    body: JSON.stringify({
      properties: {
        dealname: `${lead.name} — Intake Lead`,
        dealstage: "appointmentscheduled",
        description: lead.notes,
        closedate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      associations: [
        {
          to: { id: contactId },
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }],
        },
      ],
    }),
  });

  if (!dealRes.ok) {
    console.error("[hubspot] deal creation failed", dealRes.status, await dealRes.text());
  }
}
