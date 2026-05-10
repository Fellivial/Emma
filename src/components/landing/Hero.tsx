"use client";

import { useState } from "react";
import Link from "next/link";
import { NAV_LINKS, TICKER_ITEMS } from "@/lib/constants/landing";

function HeroTicker() {
  return (
    <div
      style={{
        overflow: "hidden",
        position: "relative",
        borderTop: "1px solid rgba(0,0,0,0.12)",
        flexShrink: 0,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "80px",
          background: "linear-gradient(to right, #e8547a, transparent)",
          zIndex: 1,
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: "80px",
          background: "linear-gradient(to left, #e8547a, transparent)",
          zIndex: 1,
          pointerEvents: "none",
        }}
      />
      <div style={{ display: "flex", width: "max-content" }}>
        {[0, 1].map((copy) => (
          <div
            key={copy}
            aria-hidden={copy === 1 ? "true" : undefined}
            className="ticker-track"
            style={{
              display: "flex",
              alignItems: "center",
              padding: "13px 0",
              animation: "marquee 30s linear infinite",
              willChange: "transform",
            }}
          >
            {TICKER_ITEMS.map((item, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center" }}>
                <span
                  style={{
                    fontFamily: "var(--font-l-mono)",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: "rgba(0,0,0,0.6)",
                    whiteSpace: "nowrap",
                    padding: "0 24px",
                  }}
                >
                  {item}
                </span>
                <span aria-hidden="true" style={{ color: "rgba(0,0,0,0.3)", fontSize: "11px" }}>
                  •
                </span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Hero() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <section
      style={{
        background: "var(--l-accent)",
        minHeight: "100svh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Watermark E */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          right: "-4%",
          top: "50%",
          transform: "translateY(-52%)",
          fontFamily: "var(--font-l-display)",
          fontSize: "clamp(280px, 36vw, 560px)",
          lineHeight: 1,
          color: "rgba(0,0,0,0.055)",
          pointerEvents: "none",
          userSelect: "none",
          letterSpacing: "-0.04em",
        }}
      >
        E
      </div>

      {/* Blueprint grid texture */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          pointerEvents: "none",
        }}
      />

      {/* ── Embedded Nav ── */}
      <nav style={{ position: "relative", zIndex: 10, flexShrink: 0 }}>
        <div
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            padding: "0 40px",
            height: "64px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(0,0,0,0.11)",
          }}
        >
          <Link
            href="/landing"
            className="l-interactive"
            style={{
              fontFamily: "var(--font-l-display)",
              fontSize: "26px",
              letterSpacing: "0.04em",
              color: "#000",
              textDecoration: "none",
            }}
          >
            EM<span style={{ opacity: 0.4 }}>M</span>A
          </Link>

          <div className="hidden md:flex" style={{ gap: "32px", alignItems: "center" }}>
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="l-interactive"
                style={{
                  fontFamily: "var(--font-l-body)",
                  fontSize: "14px",
                  color: "rgba(0,0,0,0.58)",
                  textDecoration: "none",
                  transition: "color 150ms",
                  padding: "12px 4px",
                  display: "inline-flex",
                  alignItems: "center",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = "#000")}
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLAnchorElement).style.color = "rgba(0,0,0,0.58)")
                }
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/register"
              className="l-interactive"
              style={{
                fontFamily: "var(--font-l-body)",
                fontWeight: 700,
                fontSize: "12px",
                color: "var(--l-accent)",
                background: "#000",
                padding: "12px 22px",
                textDecoration: "none",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              Get Early Access
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="flex md:hidden l-interactive"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "14px 11px",
              display: "flex",
              flexDirection: "column",
              gap: "5px",
            }}
          >
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  display: "block",
                  width: "22px",
                  height: "2px",
                  background: "#000",
                  transition: "transform 200ms, opacity 200ms",
                  transformOrigin: "center",
                  transform: menuOpen
                    ? i === 0
                      ? "translateY(7px) rotate(45deg)"
                      : i === 2
                        ? "translateY(-7px) rotate(-45deg)"
                        : "scaleX(0)"
                    : "none",
                  opacity: menuOpen && i === 1 ? 0 : 1,
                }}
              />
            ))}
          </button>
        </div>

        {/* Mobile menu */}
        <div
          style={{
            overflow: "hidden",
            maxHeight: menuOpen ? "320px" : "0",
            transition: "max-height 280ms ease",
            background: "var(--l-accent)",
            borderBottom: menuOpen ? "1px solid rgba(0,0,0,0.11)" : "none",
          }}
        >
          <div
            style={{
              padding: "16px 40px",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                style={{
                  fontFamily: "var(--font-l-body)",
                  fontSize: "16px",
                  color: "rgba(0,0,0,0.62)",
                  textDecoration: "none",
                }}
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/register"
              onClick={() => setMenuOpen(false)}
              style={{
                fontFamily: "var(--font-l-body)",
                fontWeight: 700,
                fontSize: "14px",
                color: "var(--l-accent)",
                background: "#000",
                padding: "12px 20px",
                textDecoration: "none",
                textAlign: "center",
              }}
            >
              Get Early Access
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Main content ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          maxWidth: "1280px",
          margin: "0 auto",
          width: "100%",
          padding: "60px 40px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Eyebrow */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            border: "1px solid rgba(0,0,0,0.2)",
            padding: "5px 14px",
            marginBottom: "36px",
            animation: "heroFadeIn 0.5s ease both",
            width: "fit-content",
          }}
        >
          <span
            style={{
              width: "5px",
              height: "5px",
              borderRadius: "50%",
              background: "#000",
              animation: "blink 1.8s ease infinite",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-l-mono)",
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "#000",
            }}
          >
            Introducing Emma
          </span>
        </div>

        {/* Headline */}
        <h1
          style={{
            fontFamily: "var(--font-l-display)",
            fontSize: "clamp(68px, 8vw, 118px)",
            textTransform: "uppercase",
            lineHeight: 0.91,
            color: "#000",
            marginBottom: "36px",
            animation: "heroFadeIn 0.6s ease 0.1s both",
            maxWidth: "860px",
          }}
        >
          Your home.
          <br />
          Her world.
          <br />
          Your rules.
        </h1>

        {/* Subtext */}
        <p
          style={{
            fontFamily: "var(--font-l-body)",
            fontSize: "16px",
            color: "rgba(0,0,0,0.58)",
            maxWidth: "420px",
            marginBottom: "48px",
            lineHeight: 1.7,
            animation: "heroFadeIn 0.6s ease 0.2s both",
          }}
        >
          Emma is the first AI companion system that integrates presence, voice, vision, memory, and
          autonomous action into one coherent experience.
        </p>

        {/* CTAs */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            animation: "heroFadeIn 0.6s ease 0.3s both",
          }}
        >
          <Link
            href="/register"
            className="l-interactive"
            style={{
              fontFamily: "var(--font-l-body)",
              fontWeight: 700,
              fontSize: "13px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--l-accent)",
              background: "#000",
              padding: "14px 36px",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Request Access
          </Link>
          <a
            href="#approach"
            className="l-interactive"
            style={{
              fontFamily: "var(--font-l-body)",
              fontWeight: 600,
              fontSize: "13px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#000",
              background: "transparent",
              border: "1px solid rgba(0,0,0,0.24)",
              padding: "14px 36px",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Our Approach
          </a>
        </div>

        {/* Stats */}
        <div
          style={{
            display: "flex",
            gap: "36px",
            marginTop: "56px",
            paddingTop: "32px",
            borderTop: "1px solid rgba(0,0,0,0.13)",
            animation: "heroFadeIn 0.6s ease 0.4s both",
            flexWrap: "wrap",
          }}
        >
          {[
            { val: "6", label: "Capabilities" },
            { val: "100%", label: "On-Device" },
            { val: "Always", label: "Present" },
          ].map(({ val, label }) => (
            <div key={label}>
              <div
                style={{
                  fontFamily: "var(--font-l-display)",
                  fontSize: "34px",
                  lineHeight: 1,
                  color: "#000",
                }}
              >
                {val}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-l-mono)",
                  fontSize: "9px",
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: "rgba(0,0,0,0.42)",
                  marginTop: "6px",
                }}
              >
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Ticker strip at bottom ── */}
      <HeroTicker />
    </section>
  );
}
