"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

const HEADLINE_LINES = ["Ready when", "you are."];

function AnimatedHeadline() {
  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.14, delayChildren: 0.2 } },
  };
  const line = {
    hidden: { clipPath: "inset(0 0 100% 0)", y: 20, opacity: 0 },
    show: {
      clipPath: "inset(0 0 0% 0)",
      y: 0,
      opacity: 1,
      transition: { duration: 0.68, ease },
    },
  };
  return (
    <motion.h2
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.5 }}
      style={{
        fontFamily: "var(--font-l-cond)",
        fontWeight: 900,
        fontSize: "clamp(36px, 5vw, 64px)",
        textTransform: "uppercase",
        color: "var(--l-text)",
        lineHeight: 1.0,
        marginBottom: "48px",
      }}
    >
      {HEADLINE_LINES.map((text) => (
        <span key={text} style={{ display: "block", overflow: "hidden", paddingBottom: "0.04em" }}>
          <motion.span style={{ display: "block" }} variants={line}>
            {text}
          </motion.span>
        </span>
      ))}
    </motion.h2>
  );
}

export default function FinalCTA() {
  return (
    <section
      style={{
        background: "var(--l-surface)",
        position: "relative",
        overflow: "hidden",
        padding: "96px 40px",
        textAlign: "center",
      }}
    >
      {/* Vortex grid */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(232,84,122,0.08) 0px, rgba(232,84,122,0.08) 1px, transparent 1px, transparent 52px), repeating-linear-gradient(90deg, rgba(232,84,122,0.08) 0px, rgba(232,84,122,0.08) 1px, transparent 1px, transparent 52px)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 80% at center, black, transparent)",
          maskImage: "radial-gradient(ellipse 80% 80% at center, black, transparent)",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
        <motion.p
          initial={{ opacity: 0, letterSpacing: "0.4em" }}
          whileInView={{ opacity: 1, letterSpacing: "0.16em" }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.8, ease }}
          style={{
            fontFamily: "var(--font-l-mono)",
            fontSize: "10px",
            textTransform: "uppercase",
            color: "var(--l-accent)",
            marginBottom: "20px",
          }}
        >
          Ready?
        </motion.p>

        <AnimatedHeadline />

        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.6, ease, delay: 0.45 }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          style={{ display: "inline-block" }}
        >
          <Link
            href="/waitlist"
            className="l-interactive"
            style={{
              display: "block",
              maxWidth: "520px",
              background: "var(--l-accent)",
              fontFamily: "var(--font-l-display)",
              fontSize: "clamp(20px, 2.5vw, 28px)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--l-accent-dark)",
              padding: "20px 40px",
              textDecoration: "none",
              borderRadius: 0,
            }}
          >
            Request to Join Waitlist.
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
