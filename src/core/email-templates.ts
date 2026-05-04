/**
 * Email Templates — Emma's voice in your inbox.
 *
 * All templates render three outputs: subject, html, text.
 * HTML uses inline styles only (email client compatibility).
 * Text is a plain fallback with full URLs written out.
 */

import * as crypto from "crypto";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EmailContext {
  name: string;
  email: string;
  upgradeUrl: string;
  unsubscribeUrl: string;
}

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// ─── Unsubscribe Token ───────────────────────────────────────────────────────

export function generateUnsubscribeUrl(userId: string): string {
  const key = process.env.EMMA_ENCRYPTION_KEY || "emma-fallback-key";
  const token = crypto
    .createHmac("sha256", key)
    .update(`${userId}:unsubscribe`)
    .digest("hex");
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base}/api/emma/unsubscribe?token=${token}&uid=${userId}`;
}

// ─── Render ──────────────────────────────────────────────────────────────────

export function renderEmail(templateId: string, ctx: EmailContext): RenderedEmail {
  try {
    const renderer = TEMPLATES[templateId];
    if (!renderer) {
      return {
        subject: "A message from Emma",
        html: wrapHtml(`<p style="color:#e8dfe6;">Hey ${ctx.name}. Just checking in.</p>`, ctx),
        text: `Hey ${ctx.name}. Just checking in.\n\n${ctx.upgradeUrl}`,
      };
    }
    return renderer(ctx);
  } catch {
    return {
      subject: "A message from Emma",
      html: wrapHtml(`<p style="color:#e8dfe6;">Hey ${ctx.name}. Something went wrong rendering this email, but I'm still here.</p>`, ctx),
      text: `Hey ${ctx.name}. Something went wrong, but I'm still here.\n\n${ctx.upgradeUrl}`,
    };
  }
}

// ─── Templates ───────────────────────────────────────────────────────────────

const TEMPLATES: Record<string, (ctx: EmailContext) => RenderedEmail> = {
  // Future transactional templates go here
};

// ─── HTML Helpers ─────────────────────────────────────────────────────────────

function ctaButton(label: string, url: string): string {
  return `
    <div style="text-align:center;margin:24px 0;">
      <a href="${url}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#e8a0bf,#d4819e);color:#0d0a0e;font-size:14px;font-weight:600;text-decoration:none;border-radius:12px;">
        ${label}
      </a>
    </div>
  `;
}

function wrapHtml(body: string, ctx: EmailContext): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d0a0e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px;">

    <!-- Logo -->
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#e8a0bf,#d4819e);text-align:center;line-height:44px;">
        <span style="color:#0d0a0e;font-size:22px;font-style:italic;font-weight:600;">E</span>
      </div>
    </div>

    <!-- Body -->
    ${body}

    <!-- Footer -->
    <div style="margin-top:48px;padding-top:24px;border-top:1px solid #1f1a22;text-align:center;">
      <p style="color:#4a3f4e;font-size:11px;margin:0 0 8px;">
        EMMA — Environment-Managing Modular Agent
      </p>
      <a href="${ctx.unsubscribeUrl}" style="color:#4a3f4e;font-size:11px;text-decoration:underline;">
        Unsubscribe
      </a>
    </div>

  </div>
</body>
</html>`;
}

// Suppress unused warning — ctaButton is available for future templates
void ctaButton;
