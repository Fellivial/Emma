"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle,
  CreditCard,
  ExternalLink,
  Package,
  Shield,
} from "lucide-react";
import { PLANS, EXTRA_PACK, type Plan } from "@/core/pricing";

interface BillingState {
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

interface UsageData {
  planId: string;
  billing?: BillingState;
  extraPacks?: {
    totalTokensRemaining: number;
    packs: Array<{
      id: string;
      tokensGranted: number;
      tokensRemaining: number;
      validUntil: string;
    }>;
  };
}

const SUPPORT_BILLING_HREF = "/support";

function BillingPageInner() {
  const [currentPlan, setCurrentPlan] = useState("free");
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const paymentSuccess = searchParams.get("success") === "true";

  useEffect(() => {
    fetch("/api/emma/usage")
      .then((r) => r.json())
      .then((d: UsageData) => {
        setUsage(d);
        if (d.planId) setCurrentPlan(d.planId);
      })
      .catch(() => setError("Billing status is temporarily unavailable."));
  }, []);

  const handleSubscribe = async (variantId: string) => {
    if (!variantId) return;
    setLoading(variantId);
    setError(null);
    try {
      const res = await fetch("/api/lemon/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId }),
      });
      const data = await res.json();
      if (data.url) window.location.assign(data.url);
      else setError(data.error || "Checkout is temporarily unavailable.");
    } catch {
      setError("Checkout is temporarily unavailable.");
    }
    setLoading(null);
  };

  const handleExtraPack = async () => {
    setLoading("extra_pack");
    setError(null);
    try {
      const res = await fetch("/api/lemon/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId: process.env.NEXT_PUBLIC_LEMON_VARIANT_EXTRA_PACK }),
      });
      const data = await res.json();
      if (data.url) window.location.assign(data.url);
      else setError(data.error || "Extra pack checkout is temporarily unavailable.");
    } catch {
      setError("Extra pack checkout is temporarily unavailable.");
    }
    setLoading(null);
  };

  const plans = Object.values(PLANS).filter((p) => !p.enterprise);
  const enterprise = PLANS.enterprise;
  const current = PLANS[currentPlan] ?? PLANS.free;
  const billing = usage?.billing;
  const extraTokens = usage?.extraPacks?.totalTokensRemaining ?? 0;

  return (
    <div className="max-w-5xl mx-auto px-8 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-light text-emma-100">Billing</h1>
        <p className="text-xs text-emma-300/50 mt-1">Plans, add-ons, and subscription status.</p>
      </div>

      {paymentSuccess && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/6 px-4 py-3 mb-6">
          <CheckCircle size={15} className="text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-300/80">
            Payment received. Your plan updates when Lemon confirms the subscription.
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/6 px-4 py-3 mb-6">
          <AlertTriangle size={15} className="text-amber-300 shrink-0" />
          <p className="text-sm text-amber-200/80">{error}</p>
        </div>
      )}

      <BillingStatusPanel plan={current} billing={billing} extraTokens={extraTokens} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isCurrent={plan.id === currentPlan}
            loading={loading === plan.lemonVariantId}
            onSubscribe={() => handleSubscribe(plan.lemonVariantId)}
          />
        ))}
      </div>

      <div className="rounded-2xl border border-emma-300/15 bg-emma-300/3 p-5 flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield size={15} className="text-emma-300" />
            <h3 className="text-sm font-medium text-emma-200/70">Enterprise</h3>
            {enterprise.badge && (
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-emma-300/10 border border-emma-300/20 text-emma-300">
                {enterprise.badge}
              </span>
            )}
          </div>
          <p className="text-xs font-light text-emma-200/30">
            Custom deployment review, white-label configuration, and support planning
          </p>
        </div>
        <a
          href="/support"
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 hover:opacity-90 transition-opacity shrink-0"
        >
          Contact Support
        </a>
      </div>

      <h2 className="text-xs font-medium text-emma-200/30 uppercase tracking-widest mb-4">
        Extras
      </h2>
      <div className="rounded-2xl border border-surface-border bg-surface p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-amber-400/8 border border-amber-400/15 flex items-center justify-center shrink-0">
          <Package size={16} className="text-amber-300" />
        </div>
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="text-sm font-medium text-emma-200/65">{EXTRA_PACK.name}</h3>
            <span className="text-xs font-light text-emma-300">${EXTRA_PACK.price}</span>
          </div>
          <div className="text-[10px] text-emma-200/20 mt-0.5">
            {formatTokens(EXTRA_PACK.tokens)} tokens, one-time, valid 30 days
          </div>
          <p className="text-[11px] font-light text-emma-200/30 mt-1.5 leading-relaxed">
            {EXTRA_PACK.description}
          </p>
          {usage?.extraPacks && usage.extraPacks.packs.length > 0 && (
            <div className="mt-3 text-[11px] text-emma-200/45">
              {formatTokens(extraTokens)} extra tokens available
              <div className="mt-1 flex flex-col gap-0.5 text-emma-200/25">
                {usage.extraPacks.packs.map((pack) => (
                  <span key={pack.id}>
                    {formatTokens(pack.tokensRemaining)} left, expires {formatDate(pack.validUntil)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        <button
          onClick={handleExtraPack}
          disabled={loading === "extra_pack"}
          className="px-4 py-2 rounded-lg bg-surface border border-surface-border text-[11px] text-emma-200/50 hover:bg-surface-hover cursor-pointer transition-all shrink-0 disabled:opacity-50"
        >
          {loading === "extra_pack" ? "..." : "Buy"}
        </button>
      </div>

      <p className="text-center text-[11px] text-emma-200/15 mt-6">
        Token usage is metered monthly. Weekly = monthly / 4. Daily = weekly / 7.
      </p>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense>
      <BillingPageInner />
    </Suspense>
  );
}

function BillingStatusPanel({
  plan,
  billing,
  extraTokens,
}: {
  plan: Plan;
  billing?: BillingState;
  extraTokens: number;
}) {
  const status = billing?.status ?? (plan.id === "free" ? "free" : "unknown");
  const nextDateLabel = getNextDateLabel(billing);
  const card =
    billing?.cardBrand && billing.cardLastFour
      ? `${billing.cardBrand} ending ${billing.cardLastFour}`
      : null;

  return (
    <div className="rounded-2xl border border-surface-border bg-surface p-5 mb-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CreditCard size={15} className="text-emma-300" />
            <h2 className="text-sm font-medium text-emma-200/70">Current billing status</h2>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusClass(status)}`}>
              {statusLabel(status)}
            </span>
          </div>
          <p className="text-xs text-emma-200/35">
            {plan.name} plan
            {nextDateLabel ? `, ${nextDateLabel}` : ""}
            {card ? `, ${card}` : ""}
          </p>
          {billing?.isTrial && (
            <p className="text-[11px] text-emma-300/70 mt-2">
              Trial is active. Emma is using the selected plan limits during the trial; billing
              starts after Lemon ends the trial.
            </p>
          )}
          {billing?.needsPaymentRecovery && (
            <p className="text-[11px] text-amber-200/75 mt-2">
              Payment needs attention. Emma is keeping the account recoverable, but limits may be
              reduced until payment succeeds.
            </p>
          )}
          {billing?.isCancelled && (
            <p className="text-[11px] text-emma-200/45 mt-2">
              Subscription is cancelled and remains usable until the current period ends.
            </p>
          )}
          {billing?.isExpired && (
            <p className="text-[11px] text-emma-200/45 mt-2">
              Subscription has expired. The account is on Free limits.
            </p>
          )}
          {extraTokens > 0 && (
            <p className="text-[11px] text-emma-200/35 mt-2">
              Extra pack balance: {formatTokens(extraTokens)} tokens.
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 md:justify-end">
          {billing?.needsPaymentRecovery && billing.recoveryUrl && (
            <a
              href={billing.recoveryUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-amber-300 text-emma-950 text-[11px] font-medium hover:opacity-90 transition-opacity"
            >
              Update payment <ExternalLink size={12} />
            </a>
          )}
          {billing?.portalUrl ? (
            <a
              href={billing.portalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-surface border border-surface-border text-[11px] text-emma-200/55 hover:bg-surface-hover transition-all"
            >
              Manage subscription <ExternalLink size={12} />
            </a>
          ) : (
            <a
              href={SUPPORT_BILLING_HREF}
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-surface border border-surface-border text-[11px] text-emma-200/55 hover:bg-surface-hover transition-all"
            >
              Open support
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  isCurrent,
  loading,
  onSubscribe,
}: {
  plan: Plan;
  isCurrent: boolean;
  loading: boolean;
  onSubscribe: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 flex flex-col transition-all ${
        plan.popular ? "border-emma-300/20 bg-emma-300/3" : "border-surface-border bg-surface"
      }`}
    >
      {plan.badge && (
        <div className="text-[10px] font-medium rounded-full px-2.5 py-0.5 self-start mb-2 text-emma-300 bg-emma-300/10">
          {plan.badge}
        </div>
      )}

      <h3 className="text-base font-medium text-emma-200/75">{plan.name}</h3>
      <div className="flex items-baseline gap-1 mt-1 mb-0.5">
        {plan.price === 0 ? (
          <span className="text-2xl font-light text-emma-100">Free</span>
        ) : (
          <>
            <span className="text-2xl font-light text-emma-300">${plan.price}</span>
            <span className="text-xs text-emma-200/25">/mo</span>
          </>
        )}
      </div>
      {plan.subtitle && <div className="text-[10px] text-emma-200/15 mb-1">{plan.subtitle}</div>}
      <div className="text-[10px] text-emma-200/20 mb-3">
        {plan.tokenBudgetMonthly > 100_000_000
          ? "Unlimited"
          : formatTokens(plan.tokenBudgetMonthly)}{" "}
        tokens/mo
      </div>

      <ul className="flex-1 flex flex-col gap-1.5 mb-4">
        {plan.featureList.map((f, i) => {
          const isNew = f.includes("- New");
          const label = f.replace(" - New", "");
          return (
            <li
              key={i}
              className="flex items-start gap-1.5 text-[11px] font-light text-emma-200/45"
            >
              <Check size={10} className="text-emma-300/40 shrink-0 mt-0.5" />
              {label}
              {isNew && (
                <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-300/70 border border-emerald-400/15 shrink-0">
                  New
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <button
        onClick={onSubscribe}
        disabled={isCurrent || loading || !plan.lemonVariantId}
        className={`w-full py-2 rounded-xl text-xs font-medium transition-all cursor-pointer disabled:cursor-default ${
          isCurrent
            ? "bg-emma-200/5 border border-emma-200/10 text-emma-200/20"
            : plan.popular
              ? "bg-gradient-to-r from-emma-300 to-emma-400 text-emma-950 hover:opacity-90"
              : plan.price === 0
                ? "bg-emma-200/5 border border-emma-200/10 text-emma-200/30"
                : "bg-surface border border-surface-border text-emma-200/50 hover:bg-surface-hover"
        }`}
      >
        {isCurrent ? "Current" : loading ? "..." : plan.price === 0 ? "Current Plan" : "Upgrade"}
      </button>
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Active";
    case "on_trial":
      return "Trial";
    case "past_due":
    case "unpaid":
    case "payment_failed":
      return "Payment issue";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    case "free":
      return "Free";
    default:
      return "Unknown";
  }
}

function statusClass(status: string): string {
  if (status === "active") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  if (status === "on_trial") return "border-emma-300/20 bg-emma-300/10 text-emma-300";
  if (["past_due", "unpaid", "payment_failed"].includes(status)) {
    return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  }
  if (["cancelled", "expired"].includes(status)) {
    return "border-emma-200/10 bg-emma-200/5 text-emma-200/40";
  }
  return "border-emma-200/10 bg-emma-200/5 text-emma-200/30";
}

function getNextDateLabel(billing?: BillingState): string | null {
  if (!billing) return null;
  if (billing.isCancelled && billing.endsAt) return `ends ${formatDate(billing.endsAt)}`;
  if (billing.isExpired && billing.endsAt) return `ended ${formatDate(billing.endsAt)}`;
  if (billing.renewsAt) return `renews ${formatDate(billing.renewsAt)}`;
  if (billing.endsAt) return `ends ${formatDate(billing.endsAt)}`;
  return null;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
