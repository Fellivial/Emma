"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { APPROACH_STEPS, APPROACH_PANELS } from "@/lib/constants/landing";
import type { BarEntry } from "@/lib/types/landing";

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

const wipeLine = {
  hidden: { clipPath: "inset(0 0 100% 0)", opacity: 0 },
  show: { clipPath: "inset(0 0 0% 0)", opacity: 1, transition: { duration: 0.68, ease } },
};

function BarRow({ bar }: { bar: BarEntry }) {
  return (
    <div style={{ marginBottom: "18px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "6px",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-l-mono)",
            fontSize: "9px",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: bar.isEmma ? "var(--l-accent)" : "var(--l-muted2)",
            fontWeight: bar.isEmma ? 700 : 400,
          }}
        >
          {bar.label}
        </span>
        {bar.display && (
          <span
            style={{
              fontFamily: "var(--font-l-mono)",
              fontSize: "9px",
              color: bar.isEmma ? "var(--l-accent)" : "var(--l-muted2)",
            }}
          >
            {bar.display}
          </span>
        )}
      </div>
      <div
        style={{
          height: "3px",
          background: "rgba(242,240,234,0.06)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(bar.pct, 2)}%` }}
          transition={{ duration: 0.7, ease }}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            background: bar.isEmma
              ? "var(--l-accent)"
              : bar.pct === 0
                ? "rgba(239,68,68,0.3)"
                : "rgba(242,240,234,0.18)",
          }}
        />
        {bar.pct === 0 && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              background: "rgba(239,68,68,0.08)",
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function Approach() {
  const [activeIdx, setActiveIdx] = useState(0);
  const activeStep = APPROACH_STEPS[activeIdx];
  const panel = APPROACH_PANELS[activeStep.panelKey];

  return (
    <section
      id="approach"
      style={{ background: "var(--l-bg)", borderBottom: "1px solid var(--l-border)" }}
    >
      {/* Section header */}
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.5 }}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.14 } } }}
        style={{ padding: "80px 40px 48px" }}
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
          How Emma works
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
            Built different.
            <br />
            By design.
          </motion.h2>
        </div>
      </motion.div>

      {/* Step selector + panel */}
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.6, ease }}
        style={{
          display: "grid",
          gap: "1px",
          background: "var(--l-border)",
          borderTop: "1px solid var(--l-border)",
        }}
        className="lg:grid-cols-2 grid-cols-1"
      >
        {/* Left: step list */}
        <div style={{ background: "var(--l-bg)" }}>
          {APPROACH_STEPS.map((step, i) => {
            const isActive = i === activeIdx;
            return (
              <button
                key={step.panelKey}
                onClick={() => setActiveIdx(i)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  borderBottom:
                    i < APPROACH_STEPS.length - 1 ? "1px solid var(--l-border)" : "none",
                  borderLeft: isActive ? "2px solid var(--l-accent)" : "2px solid transparent",
                  padding: isActive ? "36px 40px" : "24px 40px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontFamily: "var(--font-l-mono)",
                    fontSize: "9px",
                    textTransform: "uppercase",
                    letterSpacing: "0.16em",
                    color: isActive ? "var(--l-accent)" : "var(--l-muted2)",
                    marginBottom: "10px",
                    fontWeight: isActive ? 700 : 400,
                    transition: "color 0.2s ease",
                  }}
                >
                  {step.label}
                </span>
                <span
                  style={{
                    display: "block",
                    fontFamily: "var(--font-l-cond)",
                    fontWeight: 700,
                    fontSize: isActive ? "clamp(22px, 2.5vw, 30px)" : "18px",
                    textTransform: "uppercase",
                    color: isActive ? "var(--l-text)" : "var(--l-muted)",
                    lineHeight: 1.1,
                    marginBottom: isActive ? "14px" : "0",
                    transition: "all 0.2s ease",
                  }}
                >
                  {step.title}
                </span>
                {isActive && (
                  <AnimatePresence>
                    <motion.span
                      key={step.panelKey + "-body"}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3, ease }}
                      style={{
                        display: "block",
                        fontFamily: "var(--font-l-body)",
                        fontSize: "14px",
                        color: "var(--l-muted)",
                        lineHeight: 1.7,
                      }}
                    >
                      {step.body}
                    </motion.span>
                  </AnimatePresence>
                )}
              </button>
            );
          })}
        </div>

        {/* Right: elevated panel card */}
        <div
          style={{
            background: "var(--l-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px",
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeStep.panelKey}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.35, ease }}
              style={{
                width: "100%",
                maxWidth: "420px",
                border: "1px solid var(--l-border)",
                borderTop: "2px solid var(--l-accent)",
                background: "var(--l-surface)",
                padding: "32px",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-l-mono)",
                  fontSize: "9px",
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: "var(--l-accent)",
                  marginBottom: "16px",
                }}
              >
                {panel.title}
              </p>

              {panel.description && (
                <p
                  style={{
                    fontFamily: "var(--font-l-body)",
                    fontSize: "13px",
                    color: "var(--l-muted)",
                    lineHeight: 1.65,
                    marginBottom: "28px",
                  }}
                >
                  {panel.description}
                </p>
              )}

              <div>
                {panel.bars.map((bar) => (
                  <BarRow key={bar.label} bar={bar} />
                ))}
              </div>

              {panel.note && (
                <p
                  style={{
                    fontFamily: "var(--font-l-mono)",
                    fontSize: "9px",
                    color: "var(--l-muted2)",
                    letterSpacing: "0.06em",
                    marginTop: "20px",
                    paddingTop: "16px",
                    borderTop: "1px solid var(--l-border)",
                  }}
                >
                  {panel.note}
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </section>
  );
}
