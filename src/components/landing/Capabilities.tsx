"use client";

import { useInView } from "@/lib/hooks/useInView";
import { CAPABILITIES } from "@/lib/constants/landing";

export default function Capabilities() {
  const { ref, inView } = useInView<HTMLElement>({ threshold: 0.08 });

  return (
    <section
      id="capabilities"
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
      <div style={{ marginBottom: "48px" }}>
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
          What Emma can do
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
          Six pillars.
          <br />
          One system.
        </h2>
      </div>

      {/* 3x2 grid */}
      <div
        style={{
          display: "grid",
          border: "1px solid var(--l-border)",
          gap: "1px",
          background: "var(--l-border)",
        }}
        className="lg:grid-cols-3 md:grid-cols-2 grid-cols-1"
      >
        {CAPABILITIES.map((cap, i) => (
          <div
            key={cap.num}
            style={{
              background: "var(--l-bg)",
              padding: "40px 32px",
              opacity: inView ? 1 : 0,
              transform: inView ? "none" : "translateY(16px)",
              transition: `opacity 500ms ease ${i * 80}ms, transform 500ms ease ${i * 80}ms`,
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLDivElement).style.background = "var(--l-surface)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLDivElement).style.background = "var(--l-bg)")
            }
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
          </div>
        ))}
      </div>
    </section>
  );
}
