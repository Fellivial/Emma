"use client";

import { motion } from "framer-motion";
import { CAPABILITIES } from "@/lib/constants/landing";

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

const cardVariant = {
  hidden: { opacity: 0, y: 32, scale: 0.94 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.55, ease },
  },
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

      {/* 3x2 grid */}
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.08 }}
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
        }}
        style={{
          display: "grid",
          border: "1px solid var(--l-border)",
          gap: "1px",
          background: "var(--l-border)",
        }}
        className="lg:grid-cols-3 md:grid-cols-2 grid-cols-1"
      >
        {CAPABILITIES.map((cap) => (
          <motion.div
            key={cap.num}
            variants={cardVariant}
            whileHover={{ backgroundColor: "var(--l-surface)", scale: 1.01 }}
            style={{ background: "var(--l-bg)", padding: "40px 32px", transformOrigin: "center" }}
            transition={{ duration: 0.18 }}
          >
            <p
              style={{
                fontFamily: "var(--font-l-mono)",
                fontSize: "11px",
                color: "var(--l-accent)",
                marginBottom: "20px",
                letterSpacing: "0.08em",
              }}
            >
              [ {cap.num} ]
            </p>
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
