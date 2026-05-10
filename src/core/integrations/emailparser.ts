function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function parseInboundEmail(payload: Record<string, unknown>): {
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  attachmentCount: number;
  receivedAt: string;
} {
  try {
    // Postmark uses PascalCase keys; SendGrid uses lowercase
    const isPostmark = typeof payload.From === "string" || typeof payload.TextBody === "string";

    const from = isPostmark ? (payload.From as string) || "" : (payload.from as string) || "";

    const to = isPostmark ? (payload.To as string) || "" : (payload.to as string) || "";

    const subject = isPostmark
      ? (payload.Subject as string) || ""
      : (payload.subject as string) || "";

    const bodyHtml = isPostmark
      ? (payload.HtmlBody as string) || ""
      : (payload.html as string) || "";

    const bodyTextRaw = isPostmark
      ? (payload.TextBody as string) || ""
      : (payload.text as string) || "";

    const bodyText = bodyTextRaw || stripHtml(bodyHtml);

    const attachments = isPostmark
      ? (payload.Attachments as unknown[]) || []
      : (payload.attachments as unknown[]) || [];

    return {
      from,
      to,
      subject,
      bodyText,
      bodyHtml,
      attachmentCount: attachments.length,
      receivedAt: new Date().toISOString(),
    };
  } catch {
    return {
      from: "",
      to: "",
      subject: "",
      bodyText: "",
      bodyHtml: "",
      attachmentCount: 0,
      receivedAt: new Date().toISOString(),
    };
  }
}
