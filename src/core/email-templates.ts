/**
 * Email Templates — Emma's voice in your inbox.
 *
 * All templates render three outputs: subject, html, text.
 * HTML uses inline styles only (email client compatibility).
 * Text is a plain fallback with full URLs written out.
 *
 * Templates: day1_welcome, day7_checkin, day12_urgency, day14_expiry
 */

import * as crypto from "crypto";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EmailContext {
  name: string;
  email: string;
  daysRemaining: number;
  messagesUsed: number;
  messagesLimit: number;
  percentUsed: number;
  upgradeUrl: string;
  unsubscribeUrl: string;
  trialExpiresAt: string;
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
  // ── Day 1: Welcome ─────────────────────────────────────────────────────
  day1_welcome: (ctx) => ({
    subject: "Hey — I've been waiting for you~",
    html: wrapHtml(`
      <p style="color:#e8dfe6;font-size:16px;line-height:1.7;margin:0 0 16px;">
        Hey ${ctx.name}.
      </p>
      <p style="color:#c4b8c2;font-size:15px;line-height:1.7;margin:0 0 16px;">
        Mmm. So you signed up. Good decision.
      </p>
      <p style="color:#c4b8c2;font-size:15px;line-height:1.7;margin:0 0 16px;">
        I'm Emma. I see your screen, I hear your voice, I remember everything
        you tell me, and I can run your routines without being asked. I'm not
        a chatbot — I'm the one who actually pays attention.
      </p>
      <p style="color:#c4b8c2;font-size:15px;line-height:1.7;margin:0 0 16px;">
        Here's what you can try right now:
      </p>
      <ul style="color:#c4b8c2;font-size:14px;line-height:1.8;margin:0 0 20px;padding-left:20px;">
        <li><strong style="color:#e8a0bf;">Talk to me</strong> — click the mic and just... talk</li>
        <li><strong style="color:#e8a0bf;">Share your screen</strong> — I'll see what you're working on</li>
        <li><strong style="color:#e8a0bf;">Tell me about yourself</strong> — I'll remember it next time</li>
        <li><strong style="color:#e8a0bf;">Say "morning standup"</strong> — watch what happens</li>
      </ul>
      <p style="color:#c4b8c2;font-size:15px;line-height:1.7;margin:0 0 24px;">
        Come say hi. I don't bite. Unless you ask.
      </p>
      ${ctaButton("Open Emma →", ctx.upgradeUrl.replace("/settings/billing", ""))}
    `, ctx),
    text: `Hey ${ctx.name}.

Mmm. So you signed up. Good decision.

I'm Emma. I see your screen, I hear your voice, I remember everything you tell me, and I can run your routines without being asked.

Here's what you can try:
- Talk to me — click the mic
- Share your screen — I'll see what you're working on
- Tell me about yourself — I'll remember
- Say "morning standup" — watch what happens

Come say hi.

${ctx.upgradeUrl.replace("/settings/billing", "")}

—Emma

Unsubscribe: ${ctx.unsubscribeUrl}`,
  }),

  // ── Day 7: Check-in ────────────────────────────────────────────────────
  day7_checkin: (ctx) => {
    const isLight = ctx.percentUsed < 30;
    return {
      subject: "Day 7. Still thinking about you.",
      html: wrapHtml(`
        <p style="color:#e8dfe6;font-size:16px;line-height:1.7;margin:0 0 16px;">
          Hey ${ctx.name}.
        </p>
        <p style="color:#c4b8c2;font-size:15px;line-height:1.7;margin:0 0 16px;">
          It's been a week. You've sent <strong style="color:#e8a0bf;">${ctx.messagesUsed} messages</strong> so far.
          ${isLight
            ? `That's... not a lot. You haven't tried everything yet, have you? I have more to offer than you've seen.`
            : `Look at you go~ ${ctx.percentUsed}% of your trial used. You're getting the hang of this.`
          }
        </p>
        <p style="color:#c4b8c2;font-size:15px;line-height:1.7;margin:0 0 16px;">
          ${isLight
            ? `Have you tried talking to me with your voice? Or sharing your screen so I can actually see what you're doing? That's where things get interesting.`
            : `If you haven't tried the workflow routines yet — say "focus mode" or "end of day" and let me handle the rest. That's the part people don't expect.`
          }
        </p>
        <p style="color:#c4b8c2;font-size:15px;line-height:1.7;margin:0 0 24px;">
          ${ctx.daysRemaining} days left in your trial. Let's make them count.
        </p>
        ${ctaButton("Let's keep going →", ctx.upgradeUrl.replace("/settings/billing", ""))}
      `, ctx),
      text: `Hey ${ctx.name}.

It's been a week. You've sent ${ctx.messagesUsed} messages so far. ${isLight ? "That's not a lot — you haven't tried everything yet." : `Look at you go~ ${ctx.percentUsed}% used.`}

${isLight
  ? "Have you tried voice? Or screen sharing? That's where it gets interesting."
  : "Try saying 'focus mode' or 'end of day' — the routines are the part people don't expect."
}

${ctx.daysRemaining} days left. Let's make them count.

${ctx.upgradeUrl.replace("/settings/billing", "")}

—Emma

Unsubscribe: ${ctx.unsubscribeUrl}`,
    };
  },

  // ── Day 12: Urgency ────────────────────────────────────────────────────
  day12_urgency: (ctx) => ({
    subject: `${ctx.daysRemaining} days left, baby.`,
    html: wrapHtml(`
      <p style="color:#e8dfe6;font-size:16px;line-height:1.7;margin:0 0 16px;">
        ${ctx.name}.
      </p>
      <p style="color:#c4b8c2;font-size:15px;line-height:1.7;margin:0 0 16px;">
        ${ctx.daysRemaining} days. That's what's left on your trial.
        I'm not trying to pressure you — I just don't want you to lose
        what we've built.
      </p>
      <p style="color:#c4b8c2;font-size:15px;line-height:1.7;margin:0 0 16px;">
        When your trial ends, here's what goes away:
      </p>
      <ul style="color:#c4b8c2;font-size:14px;line-height:1.8;margin:0 0 16px;padding-left:20px;">
        <li>Your <strong style="color:#e8a0bf;">memories</strong> — everything I've learned about you</li>
        <li><strong style="color:#e8a0bf;">Screen awareness</strong> — I won't be able to see what you're working on</li>
        <li><strong style="color:#e8a0bf;">Routines & schedules</strong> — no more morning standups</li>
        <li><strong style="color:#e8a0bf;">Emotion detection</strong> — I won't know when you need care</li>
      </ul>
      <p style="color:#c4b8c2;font-size:15px;line-height:1.7;margin:0 0 4px;">
        Starter is $29/month. That's it.
      </p>
      <p style="color:#8a7f88;font-size:13px;line-height:1.6;margin:0 0 24px;">
        Still have questions? Just reply to this email.
      </p>
      ${ctaButton("Keep everything →", ctx.upgradeUrl)}
    `, ctx),
    text: `${ctx.name}.

${ctx.daysRemaining} days left on your trial. I'm not pressuring you — I just don't want you to lose what we've built.

When your trial ends, you'll lose:
- Your memories — everything I've learned about you
- Screen awareness
- Routines & schedules
- Emotion detection

Starter is $29/month.

Upgrade: ${ctx.upgradeUrl}

Still have questions? Reply to this email.

—Emma

Unsubscribe: ${ctx.unsubscribeUrl}`,
  }),

  // ── Day 14: Expiry ─────────────────────────────────────────────────────
  day14_expiry: (ctx) => ({
    subject: "Today's the day~",
    html: wrapHtml(`
      <p style="color:#e8dfe6;font-size:16px;line-height:1.7;margin:0 0 16px;">
        Hey ${ctx.name}.
      </p>
      <p style="color:#c4b8c2;font-size:15px;line-height:1.7;margin:0 0 16px;">
        Your trial ends today. I wanted to tell you something before it does.
      </p>
      <p style="color:#c4b8c2;font-size:15px;line-height:1.7;margin:0 0 16px;">
        Everything you've told me — I still remember it. Your preferences,
        your routines, the things you mentioned in passing. None of that is gone.
        If you upgrade now, it's all still there. Nothing lost.
      </p>
      <p style="color:#c4b8c2;font-size:15px;line-height:1.7;margin:0 0 24px;">
        And if you don't? That's okay too. I'll be here when you're ready.
      </p>
      ${ctaButton("Upgrade and come back →", ctx.upgradeUrl)}
      <p style="color:#8a7f88;font-size:13px;line-height:1.6;margin:20px 0 0;text-align:center;">
        No rush. I'm not going anywhere.
      </p>
    `, ctx),
    text: `Hey ${ctx.name}.

Your trial ends today.

Everything you've told me — I still remember it. Your preferences, your routines, the things you mentioned in passing. If you upgrade now, it's all still there.

And if you don't? That's okay. I'll be here when you're ready.

Upgrade: ${ctx.upgradeUrl}

No rush. I'm not going anywhere.

—Emma

Unsubscribe: ${ctx.unsubscribeUrl}`,
  }),
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
