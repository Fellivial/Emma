export interface LemonBillingMeta {
  status?: string | null;
  renewsAt?: string | null;
  endsAt?: string | null;
  cardBrand?: string | null;
  cardLastFour?: string | null;
  urls?: Record<string, unknown> | null;
}

export interface BillingState {
  planId: string;
  status: string;
  renewsAt: string | null;
  endsAt: string | null;
  cardBrand: string | null;
  cardLastFour: string | null;
  portalUrl: string | null;
  recoveryUrl: string | null;
  hasPortal: boolean;
  isTrial: boolean;
  isActivePaid: boolean;
  isCancelled: boolean;
  isExpired: boolean;
  needsPaymentRecovery: boolean;
}

const LEMON_BILLING_HOSTS = new Set(["app.lemonsqueezy.com", "store.lemonsqueezy.com"]);

function safeLemonBillingUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return LEMON_BILLING_HOSTS.has(url.hostname.toLowerCase()) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normaliseBillingState(
  planId: string,
  lemonMeta?: LemonBillingMeta | null
): BillingState {
  const status = lemonMeta?.status || (planId === "free" ? "free" : "unknown");
  const urls = lemonMeta?.urls || {};
  const portalUrl = safeLemonBillingUrl(urls.customer_portal);
  const recoveryUrl = safeLemonBillingUrl(urls.update_payment_method);
  const needsPaymentRecovery = ["past_due", "unpaid", "payment_failed"].includes(status);

  return {
    planId,
    status,
    renewsAt: lemonMeta?.renewsAt || null,
    endsAt: lemonMeta?.endsAt || null,
    cardBrand: lemonMeta?.cardBrand || null,
    cardLastFour: lemonMeta?.cardLastFour || null,
    portalUrl,
    recoveryUrl,
    hasPortal: Boolean(portalUrl),
    isTrial: status === "on_trial",
    isActivePaid: planId !== "free" && status === "active",
    isCancelled: status === "cancelled",
    isExpired: status === "expired",
    needsPaymentRecovery,
  };
}
