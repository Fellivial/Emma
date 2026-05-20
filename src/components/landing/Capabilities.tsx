"use client";

import { motion } from "framer-motion";
import { CAPABILITIES } from "@/lib/constants/landing";

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

const rowVariant = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
};

const wipeLine = {
  hidden: { clipPath: "inset(0 0 100% 0)", opacity: 0 },
  show: {
    clipPath: "inset(0 0 0% 0)",
    opacity: 1,
    transition: { duration: 0.65, ease },
  },
};

export default function Capabilities() {
  return (
    <section id="capabilities" style={{ background: "var(--l-bg)", padding: "80px 40px" }}>
      {/* Header */}
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.5 }}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12 } } }}
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
          What Emma can do
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
            }}
          >
            Six pillars.
            <br />
            One system.
          </motion.h2>
        </div>
      </motion.div>

      {/* Editorial numbered list */}
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.08 }}
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
        }}
        style={{ borderTop: "1px solid var(--l-border)" }}
      >
        {CAPABILITIES.map((cap) => (
          <motion.div
            key={cap.num}
            variants={rowVariant}
            style={{
              display: "grid",
              borderBottom: "1px solid var(--l-border)",
              padding: "28px 0",
              alignItems: "flex-start",
              gap: "16px",
            }}
            className="grid-cols-1 lg:grid-cols-[72px_220px_1fr]"
          >
            <span
              style={{
                fontFamily: "var(--font-l-mono)",
                fontSize: "11px",
                color: "var(--l-muted2)",
                letterSpacing: "0.08em",
                paddingTop: "4px",
              }}
            >
              [ {cap.num} ]
            </span>
            <h3
              style={{
                fontFamily: "var(--font-l-display)",
                fontStyle: "italic",
                fontSize: "22px",
                color: "var(--l-text)",
                lineHeight: 1.2,
              }}
            >
              {cap.title}
            </h3>
            <p
              style={{
                fontFamily: "var(--font-l-body)",
                fontSize: "14px",
                color: "var(--l-muted)",
                lineHeight: 1.65,
              }}
            >
              {cap.body}
            </p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
