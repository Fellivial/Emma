"use client";

import Link from "next/link";
import { useInView } from "@/lib/hooks/useInView";
import { PRICING_PLANS } from "@/lib/constants/landing";

export default function Pricing() {
  const { ref, inView } = useInView<HTMLElement>({ threshold: 0.08 });

  return (
    <section
      id="pricing"
      ref={ref}
      style={{
        background: "var(--l-bg)",
        padding: "80px 40px",
        opacity: inView ? 1 : 0,
        transform: inView ? "none" : "translateY(24px)",
        transition: "opacity 500ms ease, transform 500ms ease",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "12px" }}>
        <p
          style={{
            fontFamily: "var(--font-l-mono)",
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            color: "var(--l-accent)",
            marginBottom: "12px",
          }}
        >
          Pricing
        </p>
        <h2
          style={{
            fontFamily: "var(--font-l-cond)",
            fontWeight: 900,
            fontSize: "clamp(32px, 4vw, 52px)",
            textTransform: "uppercase",
            color: "var(--l-text)",
            lineHeight: 1.05,
            marginBottom: "16px",
          }}
        >
          Start free.
          <br />
          Scale when ready.
        </h2>
        <p
          style={{
            fontFamily: "var(--font-l-body)",
            fontSize: "15px",
            color: "var(--l-muted)",
            maxWidth: "480px",
            lineHeight: 1.6,
            marginBottom: "48px",
          }}
        >
          Automation unlocks on Starter and above.
          Bring your own ElevenLabs key on any plan.
        </p>
      </div>

      {/* 4-col grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          border: "1px solid var(--l-border)",
          gap: "1px",
          background: "var(--l-border)",
        }}
        className="lg:grid-cols-4 sm:grid-cols-2 grid-cols-1"
      >
        {PRICING_PLANS.map((plan) => (
          <div
            key={plan.name}
            style={{
              background: plan.featured ? "var(--l-surface)" : "var(--l-bg)",
              padding: "40px 28px",
              display: "flex",
              flexDirection: "column",
              borderTop: plan.featured
                ? "2px solid var(--l-accent)"
                : "2px solid transparent",
            }}
          >
            {/* Plan name */}
            <p
              style={{
                fontFamily: "var(--font-l-mono)",
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.16em",
                color: plan.featured ? "var(--l-accent)" : "var(--l-muted2)",
                marginBottom: "20px",
              }}
            >
              {plan.name}
            </p>

            {/* Price */}
            <p
              style={{
                fontFamily: "var(--font-l-display)",
                fontSize: "52px",
                letterSpacing: "-0.02em",
                lineHeight: 1,
                color: "var(--l-text)",
                marginBottom: "6px",
              }}
            >
              {plan.price}
            </p>
            <p
              style={{
                fontFamily: "var(--font-l-mono)",
                fontSize: "10px",
                color: "var(--l-muted2)",
                letterSpacing: "0.08em",
                marginBottom: "32px",
              }}
            >
              {plan.period}
            </p>

            {/* Features */}
            <ul
              style={{
                flex: 1,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                marginBottom: "32px",
              }}
            >
              {plan.features.map((feat) => (
                <li
                  key={feat}
                  style={{
                    display: "flex",
                    gap: "10px",
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-l-mono)",
                      fontSize: "12px",
                      color: "var(--l-accent)",
                      flexShrink: 0,
                      lineHeight: 1.6,
                    }}
                  >
                    →
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-l-body)",
                      fontSize: "13px",
                      color: "var(--l-muted)",
                      lineHeight: 1.6,
                    }}
                  >
                    {feat}
                  </span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <Link
              href={plan.ctaHref}
              className="l-interactive"
              style={{
                display: "block",
                textAlign: "center",
                fontFamily: "var(--font-l-body)",
                fontWeight: 700,
                fontSize: "13px",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                padding: "12px 20px",
                textDecoration: "none",
                borderRadius: 0,
                background: plan.featured ? "var(--l-accent)" : "transparent",
                color: plan.featured ? "var(--l-accent-dark)" : "var(--l-muted)",
                border: plan.featured
                  ? "none"
                  : "1px solid var(--l-border2)",
              }}
            >
              {plan.cta}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
