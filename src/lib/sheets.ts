interface ServiceAccount {
  client_email: string;
  private_key: string;
}

interface LeadRow {
  name: string;
  contact: string;
  notes: string;
}

// ─── JWT helpers (WebCrypto — no external dependency) ────────────────────────

function base64url(input: string | ArrayBuffer): string {
  const str = input instanceof ArrayBuffer ? String.fromCharCode(...new Uint8Array(input)) : input;
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function parsePem(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );

  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    parsePem(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );

  const jwt = `${unsigned}.${base64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  const data = await res.json();
  if (!data.access_token) throw new Error(`Sheets token error: ${JSON.stringify(data)}`);
  return data.access_token as string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Append a captured lead as a new row in the client's Google Sheet.
 * Non-fatal — caller must .catch(() => {}).
 *
 * Requires GOOGLE_SHEETS_SA_KEY (JSON string of a Google service account).
 * The sheet must be shared with the service account's client_email address.
 *
 * Row format: [ISO timestamp, name, contact, notes]
 */
export async function appendLeadToSheet(sheetsId: string, lead: LeadRow): Promise<void> {
  const saRaw = process.env.GOOGLE_SHEETS_SA_KEY;
  if (!saRaw) return;

  let sa: ServiceAccount;
  try {
    sa = JSON.parse(saRaw) as ServiceAccount;
  } catch {
    return;
  }
  if (!sa.client_email || !sa.private_key) return;

  const token = await getAccessToken(sa);
  const row = [new Date().toISOString(), lead.name, lead.contact, lead.notes];

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetsId)}/values/Sheet1!A:D:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ values: [row] }),
    }
  );

  if (!res.ok) {
    console.error("[sheets] append failed", res.status, await res.text());
  }
}
