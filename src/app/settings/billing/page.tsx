"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Zap, Shield } from "lucide-react";
import { PLANS, ADDONS, type PlanTier, type AddOn } from "@/core/pricing";

export default function BillingPage() {
  const [currentPlan] = useState("free");
  const [loading, setLoading] = useState<string | null>(null);

  const handleSubscribe = async (variantId: string) => {
    if (!variantId) return; // Free tier has no variant
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-emma-950 via-emma-900 to-emma-950 font-sans text-emma-100">
      <div className="border-b border-surface-border bg-emma-950/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link href="/settings" className="text-emma-200/30 hover:text-emma-300 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-sm font-semibold text-emma-300 tracking-wider">Billing</h1>
            <p className="text-[10px] text-emma-200/25">Plans, add-ons, and enterprise</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Plan tiers */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-10">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrent={plan.id === currentPlan}
              loading={loading === plan.lemonVariantId}
              onSubscribe={() => handleSubscribe(plan.lemonVariantId)}
            />
          ))}
        </div>

        {/* Add-ons */}
        <h2 className="text-xs font-medium text-emma-200/30 uppercase tracking-widest mb-4">Add-ons</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-10">
          {ADDONS.map((addon) => (
            <AddOnCard
              key={addon.id}
              addon={addon}
              loading={loading === addon.lemonVariantId}
              onSubscribe={() => handleSubscribe(addon.lemonVariantId)}
            />
          ))}
        </div>

        {/* Enterprise CTA */}
        <div className="rounded-2xl border border-emma-300/15 bg-emma-300/3 p-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield size={16} className="text-emma-300" />
              <h3 className="text-sm font-medium text-emma-200/70">Need a custom setup?</h3>
            </div>
            <p className="text-xs font-light text-emma-200/30">
              Dedicated instance, custom SLA, integrations, white-label — let's talk.
            </p>
          </div>
          <a
            href="mailto:enterprise@emma.ai"
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 hover:opacity-90 transition-opacity shrink-0"
          >
            Contact Sales
          </a>
        </div>

        <p className="text-center text-[11px] text-emma-200/15 mt-6">
          Token usage is metered monthly. Weekly = monthly ÷ 4. Daily = weekly ÷ 7.
        </p>
      </div>
    </div>
  );
}

function PlanCard({ plan, isCurrent, loading, onSubscribe }: {
  plan: PlanTier; isCurrent: boolean; loading: boolean; onSubscribe: () => void;
}) {
  return (
    <div className={`rounded-2xl border p-5 flex flex-col transition-all ${
      plan.enterprise
        ? "border-emma-300/25 bg-emma-300/5"
        : plan.popular
        ? "border-emma-300/20 bg-emma-300/3"
        : "border-surface-border bg-surface"
    }`}>
      {plan.badge && (
        <div className={`text-[10px] font-medium rounded-full px-2.5 py-0.5 self-start mb-2 ${
          plan.enterprise ? "text-emma-300 bg-emma-300/10" : "text-emma-300 bg-emma-300/10"
        }`}>{plan.badge}</div>
      )}

      <h3 className="text-base font-medium text-emma-200/75">{plan.name}</h3>
      <div className="flex items-baseline gap-1 mt-1 mb-0.5">
        {plan.price === 0 ? (
          <span className="text-2xl font-light text-emma-100">Free</span>
        ) : plan.contactSales ? (
          <span className="text-lg font-light text-emma-300">Contact us</span>
        ) : (
          <>
            <span className="text-2xl font-light text-emma-300">${plan.price}</span>
            <span className="text-xs text-emma-200/25">/mo</span>
          </>
        )}
      </div>
      {plan.subtitle && <div className="text-[10px] text-emma-200/15 mb-1">{plan.subtitle}</div>}
      <div className="text-[10px] text-emma-200/20 mb-3">
        {plan.tokenBudgetMonthly > 100_000_000 ? "Unlimited" : formatTokens(plan.tokenBudgetMonthly)} tokens/mo
      </div>

      <ul className="flex-1 flex flex-col gap-1.5 mb-4">
        {plan.features.map((f, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[11px] font-light text-emma-200/45">
            <Check size={10} className="text-emma-300/40 shrink-0 mt-0.5" /> {f}
          </li>
        ))}
      </ul>

      <button
        onClick={onSubscribe}
        disabled={isCurrent || loading || !plan.lemonVariantId}
        className={`w-full py-2 rounded-xl text-xs font-medium transition-all cursor-pointer disabled:cursor-default ${
          isCurrent
            ? "bg-emma-200/5 border border-emma-200/10 text-emma-200/20"
            : plan.popular || plan.enterprise
            ? "bg-gradient-to-r from-emma-300 to-emma-400 text-emma-950 hover:opacity-90"
            : plan.price === 0
            ? "bg-emma-200/5 border border-emma-200/10 text-emma-200/30"
            : "bg-surface border border-surface-border text-emma-200/50 hover:bg-surface-hover"
        }`}
      >
        {isCurrent ? "Current" : loading ? "…" : plan.contactSales ? "Contact Sales" : plan.price === 0 ? "Current Plan" : "Upgrade"}
      </button>
    </div>
  );
}

function AddOnCard({ addon, loading, onSubscribe }: {
  addon: AddOn; loading: boolean; onSubscribe: () => void;
}) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface p-5 flex items-start gap-4">
      <div className="w-10 h-10 rounded-xl bg-amber-400/8 border border-amber-400/15 flex items-center justify-center shrink-0">
        <Zap size={16} className="text-amber-300" />
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-medium text-emma-200/65">{addon.name}</h3>
        <div className="text-xs text-emma-200/25 mt-0.5">+${addon.price}/mo on top of base plan</div>
        <p className="text-[11px] font-light text-emma-200/30 mt-1.5 leading-relaxed">{addon.description}</p>
      </div>
      <button
        onClick={onSubscribe}
        disabled={loading}
        className="px-4 py-2 rounded-lg bg-surface border border-surface-border text-[11px] text-emma-200/50 hover:bg-surface-hover cursor-pointer transition-all shrink-0"
      >
        {loading ? "…" : "Add"}
      </button>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
