"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { TERMINAL_LINES, TERMINAL_FOOTER } from "@/lib/constants/landing";

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

const ASCII_EMMA = `
███████╗███╗   ███╗███╗   ███╗ █████╗
██╔════╝████╗ ████║████╗ ████║██╔══██╗
█████╗  ██╔████╔██║██╔████╔██║███████║
██╔══╝  ██║╚██╔╝██║██║╚██╔╝██║██╔══██║
███████╗██║ ╚═╝ ██║██║ ╚═╝ ██║██║  ██║
╚══════╝╚═╝     ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝`.trim();

const LEFT_LABELS = ["Live2D Avatar", "Emotion Engine", "Agent Loop"];
const RIGHT_LABELS = ["Persistent Memory", "Proactive AI", "Configurable"];

export default function TerminalShowcase() {
  const [visibleCount, setVisibleCount] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { once: true, amount: 0.2 });

  useEffect(() => {
    if (!inView) return;
    if (visibleCount >= TERMINAL_LINES.length) return;
    const id = setInterval(() => {
      setVisibleCount((c) => {
        if (c >= TERMINAL_LINES.length) {
          clearInterval(id);
          return c;
        }
        return c + 1;
      });
    }, 120);
    return () => clearInterval(id);
  }, [inView, visibleCount]);

  return (
    <section ref={sectionRef} style={{ background: "var(--l-bg)", padding: "80px 40px" }}>
      {/* Headline — clip-path wipe */}
      <div style={{ overflow: "hidden", textAlign: "center", marginBottom: "48px" }}>
        <motion.h2
          initial={{ clipPath: "inset(0 0 100% 0)", opacity: 0, y: 16 }}
          animate={inView ? { clipPath: "inset(0 0 0% 0)", opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease, delay: 0.1 }}
          style={{
            fontFamily: "var(--font-l-cond)",
            fontWeight: 900,
            fontSize: "clamp(28px, 3.5vw, 44px)",
            textTransform: "uppercase",
            color: "var(--l-text)",
            letterSpacing: "0.02em",
          }}
        >
          Built for the devoted.
        </motion.h2>
      </div>

      {/* Terminal box — scale + Y entrance */}
      <motion.div
        initial={{ opacity: 0, y: 48, scale: 0.97 }}
        animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
        transition={{ duration: 0.75, ease, delay: 0.25 }}
        style={{
          display: "grid",
          gap: "0",
          border: "1px solid var(--l-border)",
          maxWidth: "1000px",
          margin: "0 auto",
        }}
        className="lg:grid-cols-[180px_1fr_180px] grid-cols-1"
      >
        {/* Left sidebar */}
        <div
          className="hidden lg:flex"
          style={{
            flexDirection: "column",
            borderRight: "1px solid var(--l-border)",
            position: "relative",
            overflow: "visible",
          }}
        >
          {LEFT_LABELS.map((label, i) => (
            <div
              key={label}
              style={{
                flex: 1,
                position: "relative",
                display: "flex",
                alignItems: "center",
                paddingLeft: "16px",
                borderBottom: i < LEFT_LABELS.length - 1 ? "1px solid var(--l-border)" : "none",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-l-mono)",
                  fontSize: "9px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--l-muted2)",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </span>
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "50%",
                  transform: "translateY(-50%)",
                  height: "1px",
                  width: "20px",
                  background: "linear-gradient(to right, transparent, rgba(232,84,122,0.45))",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  right: "-3.5px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  border: "1.5px solid rgba(232,84,122,0.6)",
                  background: "var(--l-bg)",
                  zIndex: 2,
                }}
              />
            </div>
          ))}
        </div>

        {/* Terminal */}
        <div style={{ background: "var(--l-surface)", display: "flex", flexDirection: "column" }}>
          {/* Title bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 16px",
              borderBottom: "1px solid var(--l-border)",
            }}
          >
            <div style={{ display: "flex", gap: "6px" }}>
              {["var(--l-red)", "rgba(255,200,0,0.7)", "var(--l-green)"].map((c, i) => (
                <div
                  key={i}
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: c,
                    opacity: 0.8,
                  }}
                />
              ))}
            </div>
            <span
              style={{
                fontFamily: "var(--font-l-mono)",
                fontSize: "10px",
                color: "var(--l-muted2)",
                letterSpacing: "0.08em",
              }}
            >
              EMMA://LOCAL · ONLINE
            </span>
            <span
              style={{
                fontFamily: "var(--font-l-mono)",
                fontSize: "10px",
                color: "var(--l-green)",
                letterSpacing: "0.08em",
              }}
            >
              ● ACTIVE
            </span>
          </div>

          {/* Terminal body */}
          <div style={{ padding: "20px", flex: 1, overflowX: "auto" }}>
            <pre
              style={{
                fontFamily: "var(--font-l-mono)",
                fontSize: "8px",
                lineHeight: 1.3,
                color: "rgba(232,84,122,0.5)",
                marginBottom: "20px",
                whiteSpace: "pre",
              }}
            >
              {ASCII_EMMA}
            </pre>

            {TERMINAL_LINES.slice(0, visibleCount).map((line, i) => (
              <div
                key={i}
                style={{
                  fontFamily: "var(--font-l-mono)",
                  fontSize: "12px",
                  color: line.text.startsWith("✓")
                    ? "var(--l-green)"
                    : line.text.startsWith(">")
                      ? "var(--l-muted)"
                      : "var(--l-text)",
                  lineHeight: 1.7,
                  minHeight: "1.7em",
                }}
              >
                {line.text}
              </div>
            ))}

            {visibleCount <= TERMINAL_LINES.length && (
              <span
                style={{
                  display: "inline-block",
                  width: "8px",
                  height: "14px",
                  background: "var(--l-accent)",
                  animation: "blink 1s step-end infinite",
                  verticalAlign: "middle",
                }}
              />
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--l-border)", padding: "8px 16px" }}>
            <span
              style={{
                fontFamily: "var(--font-l-mono)",
                fontSize: "9px",
                color: "var(--l-muted2)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              {TERMINAL_FOOTER}
            </span>
          </div>
        </div>

        {/* Right sidebar */}
        <div
          className="hidden lg:flex"
          style={{
            flexDirection: "column",
            borderLeft: "1px solid var(--l-border)",
            position: "relative",
            overflow: "visible",
          }}
        >
          {RIGHT_LABELS.map((label, i) => (
            <div
              key={label}
              style={{
                flex: 1,
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                paddingRight: "16px",
                borderBottom: i < RIGHT_LABELS.length - 1 ? "1px solid var(--l-border)" : "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: "-3.5px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  border: "1.5px solid rgba(232,84,122,0.6)",
                  background: "var(--l-bg)",
                  zIndex: 2,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: "50%",
                  transform: "translateY(-50%)",
                  height: "1px",
                  width: "20px",
                  background: "linear-gradient(to right, rgba(232,84,122,0.45), transparent)",
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-l-mono)",
                  fontSize: "9px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--l-muted2)",
                  whiteSpace: "nowrap",
                  textAlign: "right",
                }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
