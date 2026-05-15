"use client";

import { useState, useEffect } from "react";
import { Check, Shield, Package } from "lucide-react";
import { PLANS, EXTRA_PACK, type Plan } from "@/core/pricing";

export default function BillingPage() {
  const [currentPlan, setCurrentPlan] = useState("free");
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/emma/usage")
      .then((r) => r.json())
      .then((d) => {
        if (d.planId) setCurrentPlan(d.planId);
      })
      .catch(() => {});
  }, []);

  const handleSubscribe = async (variantId: string) => {
    if (!variantId) return;
    setLoading(variantId);
    try {
      const res = await fetch("/api/lemon/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {}
    setLoading(null);
  };

  const handleExtraPack = async () => {
    setLoading("extra_pack");
    try {
      const res = await fetch("/api/lemon/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId: process.env.NEXT_PUBLIC_LEMON_VARIANT_EXTRA_PACK }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {}
    setLoading(null);
  };

  const plans = Object.values(PLANS).filter((p) => !p.enterprise);
  const enterprise = PLANS.enterprise;

  return (
    <div className="max-w-5xl mx-auto px-8 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-light text-emma-100">Billing</h1>
        <p className="text-xs text-emma-300/50 mt-1">Plans, add-ons, and enterprise.</p>
      </div>
      {/* Plan tiers (Free, Starter, Pro) */}
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

      {/* Enterprise CTA */}
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
            Unlimited autonomous actions · 99.9% SLA · White-label · Dedicated support
          </p>
        </div>
        <a
          href="mailto:enterprise@emma.ai"
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 hover:opacity-90 transition-opacity shrink-0"
        >
          Contact Sales
        </a>
      </div>

      {/* Extra Response Pack */}
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
            {formatTokens(EXTRA_PACK.tokens)} tokens · one-time · valid 30 days
          </div>
          <p className="text-[11px] font-light text-emma-200/30 mt-1.5 leading-relaxed">
            {EXTRA_PACK.description}
          </p>
        </div>
        <button
          onClick={handleExtraPack}
          disabled={loading === "extra_pack"}
          className="px-4 py-2 rounded-lg bg-surface border border-surface-border text-[11px] text-emma-200/50 hover:bg-surface-hover cursor-pointer transition-all shrink-0 disabled:opacity-50"
        >
          {loading === "extra_pack" ? "…" : "Buy"}
        </button>
      </div>

      <p className="text-center text-[11px] text-emma-200/15 mt-6">
        Token usage is metered monthly. Weekly = monthly ÷ 4. Daily = weekly ÷ 7.
      </p>
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
          const isNew = f.includes("— New");
          const label = f.replace(" — New", "");
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
        {isCurrent ? "Current" : loading ? "…" : plan.price === 0 ? "Current Plan" : "Upgrade"}
      </button>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
