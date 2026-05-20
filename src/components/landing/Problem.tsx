"use client";

import { motion } from "framer-motion";
import { PROBLEM_CARDS } from "@/lib/constants/landing";

function FragmentedStack() {
  return (
    <svg
      width="220"
      height="220"
      viewBox="0 0 220 220"
      role="img"
      aria-label="Fragmented AI ecosystem showing disconnected capabilities"
      style={{ display: "block" }}
    >
      {/* Corner brackets */}
      <polyline points="28,52 28,28 52,28" fill="none" stroke="rgba(232,84,122,0.45)" strokeWidth="1.5" />
      <polyline points="168,28 192,28 192,52" fill="none" stroke="rgba(232,84,122,0.45)" strokeWidth="1.5" />
      <polyline points="52,192 28,192 28,168" fill="none" stroke="rgba(232,84,122,0.45)" strokeWidth="1.5" />
      <polyline points="168,192 192,192 192,168" fill="none" stroke="rgba(232,84,122,0.45)" strokeWidth="1.5" />

      {/* Top-left node: Avatar */}
      <rect x="36" y="46" width="66" height="48" fill="rgba(232,84,122,0.04)" stroke="rgba(232,84,122,0.28)" strokeWidth="1" strokeDasharray="3 3" />
      <text x="69" y="68" textAnchor="middle" fontFamily="monospace" fontSize="7" fill="rgba(232,84,122,0.5)" letterSpacing="1.5">AVATAR</text>
      <text x="69" y="83" textAnchor="middle" fontFamily="monospace" fontSize="6" fill="rgba(242,240,234,0.28)" letterSpacing="0.5">face only</text>

      {/* Top-right node: Voice */}
      <rect x="118" y="46" width="66" height="48" fill="rgba(232,84,122,0.04)" stroke="rgba(232,84,122,0.28)" strokeWidth="1" strokeDasharray="3 3" />
      <text x="151" y="68" textAnchor="middle" fontFamily="monospace" fontSize="7" fill="rgba(232,84,122,0.5)" letterSpacing="1.5">VOICE</text>
      <text x="151" y="83" textAnchor="middle" fontFamily="monospace" fontSize="6" fill="rgba(242,240,234,0.28)" letterSpacing="0.5">reactive only</text>

      {/* Bottom-left node: Memory */}
      <rect x="36" y="126" width="66" height="48" fill="rgba(232,84,122,0.04)" stroke="rgba(232,84,122,0.28)" strokeWidth="1" strokeDasharray="3 3" />
      <text x="69" y="148" textAnchor="middle" fontFamily="monospace" fontSize="7" fill="rgba(232,84,122,0.5)" letterSpacing="1.5">MEMORY</text>
      <text x="69" y="163" textAnchor="middle" fontFamily="monospace" fontSize="6" fill="rgba(242,240,234,0.28)" letterSpacing="0.5">session only</text>

      {/* Bottom-right node: Agent */}
      <rect x="118" y="126" width="66" height="48" fill="rgba(232,84,122,0.04)" stroke="rgba(232,84,122,0.28)" strokeWidth="1" strokeDasharray="3 3" />
      <text x="151" y="148" textAnchor="middle" fontFamily="monospace" fontSize="7" fill="rgba(232,84,122,0.5)" letterSpacing="1.5">AGENT</text>
      <text x="151" y="163" textAnchor="middle" fontFamily="monospace" fontSize="6" fill="rgba(242,240,234,0.28)" letterSpacing="0.5">no presence</text>

      {/* Broken connection: horizontal top */}
      <line x1="103" y1="70" x2="117" y2="70" stroke="rgba(232,84,122,0.15)" strokeWidth="1" strokeDasharray="2 2" />
      <text x="110" y="74" textAnchor="middle" fontFamily="monospace" fontSize="9" fill="rgba(232,84,122,0.45)">
        ✕
        <animate attributeName="opacity" values="0.45;0.75;0.45" dur="2.4s" repeatCount="indefinite" />
      </text>

      {/* Broken connection: horizontal bottom */}
      <line x1="103" y1="150" x2="117" y2="150" stroke="rgba(232,84,122,0.15)" strokeWidth="1" strokeDasharray="2 2" />
      <text x="110" y="154" textAnchor="middle" fontFamily="monospace" fontSize="9" fill="rgba(232,84,122,0.45)">
        ✕
        <animate attributeName="opacity" values="0.45;0.75;0.45" dur="2.8s" repeatCount="indefinite" />
      </text>

      {/* Broken connection: vertical left */}
      <line x1="69" y1="95" x2="69" y2="124" stroke="rgba(232,84,122,0.15)" strokeWidth="1" strokeDasharray="2 2" />
      <text x="69" y="113" textAnchor="middle" fontFamily="monospace" fontSize="9" fill="rgba(232,84,122,0.45)">
        ✕
        <animate attributeName="opacity" values="0.45;0.75;0.45" dur="3.1s" repeatCount="indefinite" />
      </text>

      {/* Broken connection: vertical right */}
      <line x1="151" y1="95" x2="151" y2="124" stroke="rgba(232,84,122,0.15)" strokeWidth="1" strokeDasharray="2 2" />
      <text x="151" y="113" textAnchor="middle" fontFamily="monospace" fontSize="9" fill="rgba(232,84,122,0.45)">
        ✕
        <animate attributeName="opacity" values="0.45;0.75;0.45" dur="2.6s" repeatCount="indefinite" />
      </text>

      {/* Status label */}
      <text x="110" y="200" textAnchor="middle" fontFamily="monospace" fontSize="7.5" fill="rgba(232,84,122,0.42)" letterSpacing="2">FRAGMENTED · NO BRIDGE</text>
    </svg>
  );
}

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

const cardVariant = {
  hidden: { opacity: 0, y: 32, scale: 0.94 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.55, ease } },
};

const wipeLine = {
  hidden: { clipPath: "inset(0 0 100% 0)", opacity: 0 },
  show: { clipPath: "inset(0 0 0% 0)", opacity: 1, transition: { duration: 0.68, ease } },
};

export default function Problem() {
  return (
    <section id="problem" style={{ background: "var(--l-bg)", padding: "80px 40px" }}>
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
          The Problem
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
              maxWidth: "640px",
            }}
          >
            The market has parts.
            <br />
            Nobody has the whole.
          </motion.h2>
        </div>
      </motion.div>

      {/* Grid: eye + cards */}
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.12 }}
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
        }}
        style={{
          display: "grid",
          border: "1px solid var(--l-border)",
          gap: "1px",
          background: "var(--l-border)",
        }}
        className="lg:grid-cols-[300px_1fr] grid-cols-1"
      >
        {/* Surveillance eye */}
        <motion.div
          variants={{
            hidden: { opacity: 0, scale: 0.88 },
            show: { opacity: 1, scale: 1, transition: { duration: 0.7, ease } },
          }}
          className="hidden lg:flex"
          style={{
            background: "var(--l-surface)",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px",
          }}
        >
          <FragmentedStack />
        </motion.div>

        {/* 2x2 cards */}
        <div
          style={{
            display: "grid",
            gap: "1px",
            background: "var(--l-border)",
          }}
          className="sm:grid-cols-2 grid-cols-1"
        >
          {PROBLEM_CARDS.map((card) => (
            <motion.div
              key={card.num}
              variants={cardVariant}
              whileHover={{ backgroundColor: "var(--l-surface2)", scale: 1.01 }}
              style={{ background: "var(--l-surface)", padding: "32px" }}
              transition={{ duration: 0.15 }}
            >
              <div
                style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-l-mono)",
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: "var(--l-accent)",
                  }}
                >
                  {card.tag}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-l-mono)",
                    fontSize: "10px",
                    color: "var(--l-muted2)",
                  }}
                >
                  {card.num}
                </span>
              </div>
              <h3
                style={{
                  fontFamily: "var(--font-l-cond)",
                  fontWeight: 700,
                  fontSize: "22px",
                  textTransform: "uppercase",
                  color: "var(--l-text)",
                  lineHeight: 1.15,
                  marginBottom: "12px",
                }}
              >
                {card.title}
              </h3>
              <p
                style={{
                  fontFamily: "var(--font-l-body)",
                  fontSize: "14px",
                  color: "var(--l-muted)",
                  lineHeight: 1.65,
                }}
              >
                {card.body}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
