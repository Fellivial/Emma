"use client";

import { useState, useRef, useEffect } from "react";
import { useInView } from "@/lib/hooks/useInView";
import { APPROACH_STEPS, APPROACH_PANELS } from "@/lib/constants/landing";
import type { ApproachStep } from "@/lib/types/landing";

export default function Approach() {
  const [activeStep, setActiveStep] = useState(0);
  const [fading, setFading] = useState(false);
  const { ref: sectionRef, inView } = useInView<HTMLElement>({ threshold: 0.12 });

  const panelKey = APPROACH_STEPS[activeStep].panelKey;
  const panel = APPROACH_PANELS[panelKey];

  const changeStep = (i: number) => {
    if (i === activeStep) return;
    setFading(true);
    setTimeout(() => {
      setActiveStep(i);
      setFading(false);
    }, 200);
  };

  return (
    <section
      id="approach"
      ref={sectionRef}
      style={{
        background: "var(--l-bg)",
        borderBottom: "1px solid var(--l-border)",
        opacity: inView ? 1 : 0,
        transform: inView ? "none" : "translateY(24px)",
        transition: "opacity 500ms ease, transform 500ms ease",
      }}
    >
      {/* Section header */}
      <div style={{ padding: "80px 40px 48px" }}>
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
          How Emma works
        </p>
        <h2
          style={{
            fontFamily: "var(--font-l-cond)",
            fontWeight: 900,
            fontSize: "clamp(32px, 4vw, 52px)",
            textTransform: "uppercase",
            color: "var(--l-text)",
            lineHeight: 1.05,
          }}
        >
          Built different
          <br />
          by design.
        </h2>
      </div>

      {/* Two-col layout */}
      <div
        style={{
          display: "grid",
          borderTop: "1px solid var(--l-border)",
        }}
        className="lg:grid-cols-[380px_1fr] grid-cols-1"
      >
        {/* Left: steps */}
        <div style={{ borderRight: "1px solid var(--l-border)" }}>
          {APPROACH_STEPS.map((step: ApproachStep, i: number) => (
            <button
              key={step.panelKey}
              onClick={() => changeStep(i)}
              className="l-interactive"
              style={{
                width: "100%",
                textAlign: "left",
                padding: "32px 40px",
                background: i === activeStep ? "var(--l-surface)" : "transparent",
                borderBottom:
                  i < APPROACH_STEPS.length - 1
                    ? "1px solid var(--l-border)"
                    : "none",
                borderLeft: i === activeStep
                  ? "3px solid var(--l-accent)"
                  : "3px solid transparent",
                cursor: "pointer",
                transition: "background 150ms, border-color 150ms",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-l-mono)",
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: "var(--l-muted2)",
                  marginBottom: "8px",
                }}
              >
                {step.label}
              </p>
              <h3
                style={{
                  fontFamily: "var(--font-l-cond)",
                  fontWeight: 700,
                  fontSize: "18px",
                  textTransform: "uppercase",
                  color: i === activeStep ? "var(--l-text)" : "var(--l-muted)",
                  lineHeight: 1.25,
                  transition: "color 150ms",
                }}
              >
                {step.title}
              </h3>
            </button>
          ))}
        </div>

        {/* Right: data panel */}
        <div
          style={{
            padding: "48px 48px",
            minHeight: "340px",
            opacity: fading ? 0 : 1,
            transition: "opacity 200ms",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-l-mono)",
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              color: "var(--l-muted2)",
              marginBottom: "28px",
            }}
          >
            {panel.title}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {panel.bars.map((bar, i) => (
              <BarRow
                key={bar.label}
                label={bar.label}
                pct={bar.pct}
                isEmma={bar.isEmma}
                display={bar.display}
                delay={i * 150}
                animate={inView && !fading}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function BarRow({
  label,
  pct,
  isEmma,
  display,
  delay,
  animate,
}: {
  label: string;
  pct: number;
  isEmma?: boolean;
  display?: string;
  delay: number;
  animate: boolean;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!barRef.current) return;
    if (animate) {
      barRef.current.style.transitionDelay = `${delay}ms`;
      barRef.current.style.transform = `scaleX(${pct / 100})`;
    } else {
      barRef.current.style.transitionDelay = "0ms";
      barRef.current.style.transform = "scaleX(0)";
    }
  }, [animate, pct, delay]);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "8px",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-l-body)",
            fontSize: "13px",
            color: isEmma ? "var(--l-text)" : "var(--l-muted)",
          }}
        >
          {label}
        </span>
        {display && (
          <span
            style={{
              fontFamily: "var(--font-l-mono)",
              fontSize: "11px",
              color: isEmma ? "var(--l-green)" : "var(--l-muted2)",
            }}
          >
            {display}
          </span>
        )}
      </div>
      <div
        style={{
          height: "6px",
          background: "var(--l-surface2)",
          borderRadius: 0,
          overflow: "hidden",
        }}
      >
        <div
          ref={barRef}
          style={{
            height: "100%",
            width: "100%",
            background: isEmma ? "var(--l-green)" : "var(--l-surface2)",
            transition: "transform 1s ease",
            transform: "scaleX(0)",
            transformOrigin: "left",
          }}
        />
      </div>
    </div>
  );
}
