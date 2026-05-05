"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { PROBLEM_CARDS } from "@/lib/constants/landing";

function SurveillanceEye() {
  const [pupil, setPupil] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const maxTravel = 20;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const scale = dist === 0 ? 0 : Math.min(1, maxTravel / dist);
    setPupil({ x: dx * scale, y: dy * scale });
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

  return (
    <svg
      ref={svgRef}
      width="220"
      height="220"
      viewBox="0 0 220 220"
      role="img"
      aria-label="Surveillance eye monitoring graphic"
      style={{ display: "block" }}
    >
      {/* Corner viewfinder L-brackets */}
      <polyline points="28,52 28,28 52,28" fill="none" stroke="rgba(232,84,122,0.45)" strokeWidth="1.5" />
      <polyline points="168,28 192,28 192,52" fill="none" stroke="rgba(232,84,122,0.45)" strokeWidth="1.5" />
      <polyline points="52,192 28,192 28,168" fill="none" stroke="rgba(232,84,122,0.45)" strokeWidth="1.5" />
      <polyline points="168,192 192,192 192,168" fill="none" stroke="rgba(232,84,122,0.45)" strokeWidth="1.5" />

      {/* Outer rotating dashed ring */}
      <circle cx="110" cy="110" r="96" fill="none" stroke="rgba(232,84,122,0.09)" strokeWidth="1" strokeDasharray="4 7">
        <animateTransform attributeName="transform" type="rotate" from="0 110 110" to="360 110 110" dur="22s" repeatCount="indefinite" />
      </circle>

      {/* 5 concentric rings */}
      {[78, 62, 47, 33, 19].map((r, i) => (
        <circle
          key={r}
          cx="110"
          cy="110"
          r={r}
          fill="none"
          stroke={`rgba(232,84,122,${0.11 + i * 0.038})`}
          strokeWidth="1"
        />
      ))}

      {/* Crosshairs */}
      <line x1="110" y1="32" x2="110" y2="188" stroke="rgba(232,84,122,0.09)" strokeWidth="1" />
      <line x1="32" y1="110" x2="188" y2="110" stroke="rgba(232,84,122,0.09)" strokeWidth="1" />

      {/* Diagonal scan lines */}
      <line x1="58" y1="58" x2="162" y2="162" stroke="rgba(232,84,122,0.05)" strokeWidth="1" strokeDasharray="3 6" />
      <line x1="162" y1="58" x2="58" y2="162" stroke="rgba(232,84,122,0.05)" strokeWidth="1" strokeDasharray="3 6" />

      {/* Radar sweep */}
      <g style={{ transformOrigin: "110px 110px" }}>
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 110 110"
          to="360 110 110"
          dur="4.5s"
          repeatCount="indefinite"
          className="radar-sweep"
        />
        <path
          d="M110 110 L110 32 A78 78 0 0 1 178 148 Z"
          fill="url(#eyeSweepGrad)"
          opacity="0.22"
        />
      </g>

      {/* Mouse-tracking pupil */}
      <g transform={`translate(${pupil.x}, ${pupil.y})`}>
        {/* Iris */}
        <circle cx="110" cy="110" r="22" fill="rgba(232,84,122,0.1)" stroke="rgba(232,84,122,0.5)" strokeWidth="1.5" />
        <circle cx="110" cy="110" r="14" fill="none" stroke="rgba(232,84,122,0.22)" strokeWidth="1" />
        {/* Pupil */}
        <circle cx="110" cy="110" r="7" fill="#e8547a" opacity="0.92">
          <animate attributeName="opacity" values="0.92;0.5;0.92" dur="2.6s" repeatCount="indefinite" />
          <animate attributeName="r" values="7;8.5;7" dur="2.6s" repeatCount="indefinite" />
        </circle>
        {/* Catchlight */}
        <circle cx="113.5" cy="107" r="2" fill="rgba(255,255,255,0.35)" />
      </g>

      {/* Status text */}
      <text
        x="110"
        y="198"
        textAnchor="middle"
        fontFamily="monospace"
        fontSize="7.5"
        fill="rgba(232,84,122,0.42)"
        letterSpacing="2.5"
      >
        MONITORING ACTIVE
      </text>

      <defs>
        <radialGradient id="eyeSweepGrad" cx="0%" cy="100%" r="100%">
          <stop offset="0%" stopColor="#e8547a" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#e8547a" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export default function Problem() {
  return (
    <section
      id="problem"
      style={{
        background: "var(--l-bg)",
        padding: "80px 40px",
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
          The Problem
        </p>
        <h2
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
        </h2>
      </div>

      {/* Grid: eye + cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "300px 1fr",
          border: "1px solid var(--l-border)",
          gap: "1px",
          background: "var(--l-border)",
        }}
        className="lg:grid-cols-[300px_1fr] grid-cols-1"
      >
        {/* Surveillance eye — hidden on small screens */}
        <div
          className="hidden lg:flex"
          style={{
            background: "var(--l-surface)",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px",
          }}
        >
          <SurveillanceEye />
        </div>

        {/* 2x2 cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1px",
            background: "var(--l-border)",
          }}
          className="sm:grid-cols-2 grid-cols-1"
        >
          {PROBLEM_CARDS.map((card) => (
            <div
              key={card.num}
              style={{
                background: "var(--l-surface)",
                padding: "32px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
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
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
