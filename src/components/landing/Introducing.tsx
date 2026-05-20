"use client";

import { motion } from "framer-motion";
import { FEATURE_STRIP } from "@/lib/constants/landing";

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

const wipeLine = {
  hidden: { clipPath: "inset(0 0 100% 0)", opacity: 0 },
  show: { clipPath: "inset(0 0 0% 0)", opacity: 1, transition: { duration: 0.68, ease } },
};

const cardVariant = {
  hidden: { opacity: 0, y: 32, scale: 0.94 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.55, ease } },
};

function ArchitectureDiagram() {
  const particles1 = [0, 0.4, 0.8];
  const particles2 = [0.2, 0.6, 1.0];

  return (
    <svg
      viewBox="0 0 600 368"
      style={{ width: "100%", height: "auto", display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <path id="hPath1" d="M 168 177 L 215 177" />
        <path id="hPath2" d="M 385 177 L 432 177" />
        <path id="vPathTop" d="M 300 60 L 300 100" />
        <path id="vPathBottom" d="M 300 274 L 300 312" />
      </defs>

      {/* ─── TRAINING DATA (top, blocked) ─── */}
      <rect
        x="200"
        y="12"
        width="200"
        height="48"
        fill="rgba(239,68,68,0.04)"
        stroke="rgba(239,68,68,0.3)"
        strokeWidth="1"
        strokeDasharray="4 3"
      />
      <text
        x="300"
        y="33"
        textAnchor="middle"
        fontFamily="monospace"
        fontSize="7"
        fill="rgba(239,68,68,0.5)"
        letterSpacing="1.5"
      >
        TRAINING DATA
      </text>
      <text
        x="300"
        y="49"
        textAnchor="middle"
        fontFamily="monospace"
        fontSize="9"
        fill="rgba(239,68,68,0.35)"
        letterSpacing="1"
      >
        BLOCKED
      </text>

      {/* Top connector line + ✕ */}
      <line
        x1="300"
        y1="60"
        x2="300"
        y2="100"
        stroke="rgba(239,68,68,0.2)"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <text
        x="300"
        y="84"
        textAnchor="middle"
        fontFamily="monospace"
        fontSize="11"
        fill="rgba(239,68,68,0.5)"
      >
        ✕
        <animate attributeName="opacity" values="0.5;0.8;0.5" dur="2.4s" repeatCount="indefinite" />
      </text>
      <text
        x="318"
        y="84"
        textAnchor="start"
        fontFamily="monospace"
        fontSize="7"
        fill="rgba(239,68,68,0.4)"
        letterSpacing="1"
      >
        SEVERED
      </text>

      {/* ─── OUTER EMMA PLATFORM CONTAINER ─── */}
      <rect
        x="24"
        y="100"
        width="552"
        height="174"
        fill="none"
        stroke="rgba(232,84,122,0.22)"
        strokeWidth="1"
        strokeDasharray="5 4"
      />
      <text
        x="36"
        y="94"
        fontFamily="monospace"
        fontSize="7"
        fill="rgba(232,84,122,0.4)"
        letterSpacing="1.5"
      >
        EMMA PLATFORM
      </text>

      {/* ─── YOUR CONTEXT (left box) ─── */}
      <rect
        x="48"
        y="124"
        width="120"
        height="106"
        fill="rgba(232,84,122,0.04)"
        stroke="rgba(232,84,122,0.28)"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <text
        x="108"
        y="166"
        textAnchor="middle"
        fontFamily="monospace"
        fontSize="7"
        fill="rgba(232,84,122,0.5)"
        letterSpacing="1.5"
      >
        YOUR
      </text>
      <text
        x="108"
        y="182"
        textAnchor="middle"
        fontFamily="monospace"
        fontSize="11"
        fill="rgba(242,240,234,0.65)"
        letterSpacing="1"
      >
        CONTEXT
      </text>

      {/* Left connector: dashes + arrow + particles */}
      <line
        x1="168"
        y1="177"
        x2="214"
        y2="177"
        stroke="rgba(232,84,122,0.2)"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <polygon points="214,173 214,181 222,177" fill="rgba(232,84,122,0.4)" />
      {particles1.map((delay, i) => (
        <circle key={`lp-${i}`} r="3" fill="#e8547a">
          <animateMotion dur="1.5s" begin={`${delay * 1.5}s`} repeatCount="indefinite">
            <mpath href="#hPath1" />
          </animateMotion>
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            dur="1.5s"
            begin={`${delay * 1.5}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}

      {/* ─── EMMA (center, prominent) ─── */}
      <rect
        x="215"
        y="107"
        width="170"
        height="140"
        fill="rgba(232,84,122,0.07)"
        stroke="rgba(232,84,122,0.7)"
        strokeWidth="1.5"
      />
      <rect
        x="221"
        y="113"
        width="158"
        height="128"
        fill="none"
        stroke="rgba(232,84,122,0.18)"
        strokeWidth="1"
      />
      <text
        x="300"
        y="188"
        textAnchor="middle"
        fontFamily="sans-serif"
        fontSize="30"
        fontWeight="bold"
        fill="#e8547a"
        letterSpacing="5"
      >
        EMMA
      </text>

      {/* Right connector: particles + arrow + dashes */}
      <polygon points="378,173 378,181 386,177" fill="rgba(34,197,94,0.4)" />
      <line
        x1="386"
        y1="177"
        x2="432"
        y2="177"
        stroke="rgba(34,197,94,0.2)"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      {particles2.map((delay, i) => (
        <circle key={`rp-${i}`} r="3" fill="#22c55e">
          <animateMotion dur="1.5s" begin={`${delay * 1.5}s`} repeatCount="indefinite">
            <mpath href="#hPath2" />
          </animateMotion>
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            dur="1.5s"
            begin={`${delay * 1.5}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}

      {/* ─── RESPONSE (right box) ─── */}
      <rect
        x="432"
        y="124"
        width="120"
        height="106"
        fill="rgba(34,197,94,0.04)"
        stroke="rgba(34,197,94,0.28)"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <text
        x="492"
        y="166"
        textAnchor="middle"
        fontFamily="monospace"
        fontSize="7"
        fill="rgba(34,197,94,0.5)"
        letterSpacing="1.5"
      >
        INTELLIGENT
      </text>
      <text
        x="492"
        y="182"
        textAnchor="middle"
        fontFamily="monospace"
        fontSize="11"
        fill="rgba(242,240,234,0.65)"
        letterSpacing="1"
      >
        RESPONSE
      </text>

      {/* Bottom connector line + ✕ */}
      <line
        x1="300"
        y1="274"
        x2="300"
        y2="312"
        stroke="rgba(239,68,68,0.2)"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <text
        x="300"
        y="296"
        textAnchor="middle"
        fontFamily="monospace"
        fontSize="11"
        fill="rgba(239,68,68,0.5)"
      >
        ✕
        <animate attributeName="opacity" values="0.5;0.8;0.5" dur="3.1s" repeatCount="indefinite" />
      </text>
      <text
        x="318"
        y="296"
        textAnchor="start"
        fontFamily="monospace"
        fontSize="7"
        fill="rgba(239,68,68,0.4)"
        letterSpacing="1"
      >
        SEVERED
      </text>

      {/* ─── TELEMETRY (bottom, blocked) ─── */}
      <rect
        x="200"
        y="312"
        width="200"
        height="48"
        fill="rgba(239,68,68,0.04)"
        stroke="rgba(239,68,68,0.3)"
        strokeWidth="1"
        strokeDasharray="4 3"
      />
      <text
        x="300"
        y="333"
        textAnchor="middle"
        fontFamily="monospace"
        fontSize="7"
        fill="rgba(239,68,68,0.5)"
        letterSpacing="1.5"
      >
        TELEMETRY
      </text>
      <text
        x="300"
        y="349"
        textAnchor="middle"
        fontFamily="monospace"
        fontSize="9"
        fill="rgba(239,68,68,0.35)"
        letterSpacing="1"
      >
        BLOCKED
      </text>
    </svg>
  );
}

export default function Introducing() {
  return (
    <section id="introducing" style={{ background: "var(--l-bg)", padding: "80px 40px 0" }}>
      {/* Section header */}
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.5 }}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.14 } } }}
        style={{ marginBottom: "64px" }}
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
          Architecture
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
            Integrated. Private. Yours.
          </motion.h2>
        </div>
      </motion.div>

      {/* Architecture diagram */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.75, ease }}
        style={{
          position: "relative",
          maxWidth: "760px",
          margin: "0 auto 64px",
          border: "1px solid var(--l-border)",
          background: "var(--l-surface)",
          padding: "48px 32px 40px",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "12px",
            left: "16px",
            fontFamily: "var(--font-l-mono)",
            fontSize: "9px",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--l-muted2)",
          }}
        >
          EMMA ARCHITECTURE
        </span>
        <ArchitectureDiagram />
      </motion.div>

      {/* Feature strip */}
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1 } } }}
        style={{
          display: "grid",
          border: "1px solid var(--l-border)",
          borderTop: "none",
          gap: "1px",
          background: "var(--l-border)",
        }}
        className="lg:grid-cols-3 grid-cols-1"
      >
        {FEATURE_STRIP.map((feat) => (
          <motion.div
            key={feat.tag}
            variants={cardVariant}
            style={{ background: "var(--l-surface)", padding: "40px 32px" }}
          >
            <span
              style={{
                display: "inline-block",
                fontFamily: "var(--font-l-mono)",
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "var(--l-accent)",
                border: "1px solid rgba(232,84,122,0.3)",
                padding: "3px 10px",
                marginBottom: "20px",
              }}
            >
              {feat.tag}
            </span>
            <h3
              style={{
                fontFamily: "var(--font-l-display)",
                fontSize: "32px",
                color: "var(--l-text)",
                lineHeight: 1,
                marginBottom: "12px",
              }}
            >
              {feat.title}
            </h3>
            <p
              style={{
                fontFamily: "var(--font-l-body)",
                fontSize: "13px",
                color: "var(--l-muted)",
                lineHeight: 1.65,
              }}
            >
              {feat.body}
            </p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
