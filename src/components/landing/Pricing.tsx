"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { PRICING_PLANS } from "@/lib/constants/landing";

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

const wipeLine = {
  hidden: { clipPath: "inset(0 0 100% 0)", opacity: 0 },
  show: {
    clipPath: "inset(0 0 0% 0)",
    opacity: 1,
    transition: { duration: 0.65, ease },
  },
};

const cardVariant = (featured: boolean) => ({
  hidden: { opacity: 0, y: 48, scale: featured ? 0.96 : 0.93 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.6, ease },
  },
});

export default function Pricing() {
  return (
    <section id="pricing" style={{ background: "var(--l-bg)", padding: "80px 40px" }}>
      {/* Header */}
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.5 }}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.14 } } }}
        style={{ marginBottom: "48px" }}
      >
        <motion.p
          variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.4 } } }}
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
        </motion.p>
        <div style={{ overflow: "hidden" }}>
          <motion.h2
            variants={wipeLine}
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
          </motion.h2>
        </div>
        <motion.p
          variants={{
            hidden: { opacity: 0, y: 16 },
            show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
          }}
          style={{
            fontFamily: "var(--font-l-body)",
            fontSize: "15px",
            color: "var(--l-muted)",
            maxWidth: "480px",
            lineHeight: 1.6,
          }}
        >
          Automation unlocks on Starter and above. Bring your own ElevenLabs key on any plan.
        </motion.p>
      </motion.div>

      {/* 4-col grid */}
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.15 }}
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
        }}
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
          <motion.div
            key={plan.name}
            variants={cardVariant(!!plan.featured)}
            style={{
              background: plan.featured ? "var(--l-surface)" : "var(--l-bg)",
              padding: "40px 28px",
              display: "flex",
              flexDirection: "column",
              borderTop: plan.featured ? "2px solid var(--l-accent)" : "2px solid transparent",
            }}
          >
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
                <li key={feat} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
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
                border: plan.featured ? "none" : "1px solid var(--l-border2)",
              }}
            >
              {plan.cta}
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
