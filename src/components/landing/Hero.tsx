"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { NAV_LINKS, TICKER_ITEMS } from "@/lib/constants/landing";

// ── Headline lines ────────────────────────────────────────────────────────────

const HEADLINE_LINES = ["She remembers.", "She notices.", "She moves first."];

function AnimatedHeadline() {
  const container = {
    hidden: {},
    show: {
      transition: { staggerChildren: 0.14, delayChildren: 0.35 },
    },
  };

  const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

  const line = {
    hidden: { clipPath: "inset(0 0 100% 0)", y: 24, opacity: 0 },
    show: {
      clipPath: "inset(0 0 0% 0)",
      y: 0,
      opacity: 1,
      transition: { duration: 0.72, ease },
    },
  };

  return (
    <motion.h1
      variants={container}
      initial="hidden"
      animate="show"
      style={{
        fontFamily: "var(--font-l-display)",
        fontSize: "clamp(68px, 8vw, 118px)",
        fontStyle: "italic",
        lineHeight: 1.05,
        color: "var(--l-text)",
        marginBottom: "36px",
        maxWidth: "860px",
      }}
    >
      {HEADLINE_LINES.map((text) => (
        <span key={text} style={{ display: "block", overflow: "hidden", paddingBottom: "0.06em" }}>
          <motion.span style={{ display: "block" }} variants={line}>
            {text}
          </motion.span>
        </span>
      ))}
    </motion.h1>
  );
}

// ── Watermark E with mouse parallax ──────────────────────────────────────────

function WatermarkE() {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springX = useSpring(mouseX, { stiffness: 30, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 30, damping: 20 });

  const x = useTransform(springX, [-1, 1], [-18, 18]);
  const y = useTransform(springY, [-1, 1], [-10, 10]);
  const rotateY = useTransform(springX, [-1, 1], ["-6deg", "6deg"]);
  const rotateX = useTransform(springY, [-1, 1], ["4deg", "-4deg"]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      mouseX.set((e.clientX / window.innerWidth - 0.5) * 2);
      mouseY.set((e.clientY / window.innerHeight - 0.5) * 2);
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [mouseX, mouseY]);

  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
      style={{
        position: "absolute",
        right: "-4%",
        top: "50%",
        translateY: "-52%",
        fontFamily: "var(--font-l-display)",
        fontStyle: "italic",
        fontSize: "clamp(280px, 36vw, 560px)",
        lineHeight: 1,
        color: "rgba(255,255,255,0.04)",
        pointerEvents: "none",
        userSelect: "none",
        letterSpacing: "-0.04em",
        x,
        y,
        rotateX,
        rotateY,
      }}
    >
      E
    </motion.div>
  );
}

// ── Ticker ────────────────────────────────────────────────────────────────────

function HeroTicker() {
  return (
    <div
      style={{
        overflow: "hidden",
        position: "relative",
        borderTop: "1px solid var(--l-border)",
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
          background: "linear-gradient(to right, #111113, transparent)",
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
          background: "linear-gradient(to left, #111113, transparent)",
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
                    color: "var(--l-muted)",
                    whiteSpace: "nowrap",
                    padding: "0 24px",
                  }}
                >
                  {item}
                </span>
                <span aria-hidden="true" style={{ color: "var(--l-muted2)", fontSize: "11px" }}>
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

// ── FadeUp helper ─────────────────────────────────────────────────────────────

function FadeUp({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.6,
        ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
        delay,
      }}
      style={style}
    >
      {children}
    </motion.div>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

export default function Hero() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <section
      style={{
        background: "var(--l-bg)",
        minHeight: "100svh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <WatermarkE />

      {/* Subtle grid — barely perceptible on dark */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.8 }}
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          pointerEvents: "none",
        }}
      />

      {/* ── Embedded Nav ── */}
      <nav style={{ position: "relative", zIndex: 10, flexShrink: 0 }}>
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            padding: "0 40px",
            height: "64px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--l-border)",
          }}
        >
          <Link
            href="/landing"
            className="l-interactive"
            style={{
              fontFamily: "var(--font-l-display)",
              fontStyle: "italic",
              fontSize: "28px",
              letterSpacing: "0.04em",
              color: "var(--l-text)",
              textDecoration: "none",
            }}
          >
            Em<span style={{ opacity: 0.4 }}>m</span>a
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
                  color: "var(--l-muted)",
                  textDecoration: "none",
                  transition: "color 150ms",
                  padding: "12px 4px",
                  display: "inline-flex",
                  alignItems: "center",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLAnchorElement).style.color = "var(--l-text)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLAnchorElement).style.color = "var(--l-muted)")
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
                color: "#111113",
                background: "var(--l-accent)",
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
                  background: "var(--l-text)",
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
        </motion.div>

        {/* Mobile menu */}
        <div
          style={{
            overflow: "hidden",
            maxHeight: menuOpen ? "320px" : "0",
            transition: "max-height 280ms ease",
            background: "var(--l-bg)",
            borderBottom: menuOpen ? "1px solid var(--l-border)" : "none",
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
                  color: "var(--l-muted)",
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
                color: "#111113",
                background: "var(--l-accent)",
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
        <FadeUp delay={0.1}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              border: "1px solid var(--l-border)",
              padding: "5px 14px",
              marginBottom: "36px",
              width: "fit-content",
            }}
          >
            <span
              style={{
                width: "5px",
                height: "5px",
                borderRadius: "50%",
                background: "var(--l-accent)",
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
                color: "var(--l-muted)",
              }}
            >
              Introducing Emma
            </span>
          </div>
        </FadeUp>

        {/* Headline — clip-path line wipe, staggered */}
        <AnimatedHeadline />

        {/* Subtext */}
        <FadeUp delay={0.72}>
          <p
            style={{
              fontFamily: "var(--font-l-body)",
              fontSize: "16px",
              color: "var(--l-muted)",
              maxWidth: "420px",
              marginBottom: "48px",
              lineHeight: 1.7,
            }}
          >
            Emma is the first AI companion system that integrates presence, voice, vision, memory,
            and autonomous action into one coherent experience.
          </p>
        </FadeUp>

        {/* CTAs */}
        <FadeUp delay={0.86}>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <motion.div whileHover={{ scale: 1.025 }} whileTap={{ scale: 0.97 }}>
              <Link
                href="/register"
                className="l-interactive"
                style={{
                  fontFamily: "var(--font-l-body)",
                  fontWeight: 700,
                  fontSize: "13px",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "#111113",
                  background: "var(--l-accent)",
                  padding: "14px 36px",
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                Request Access
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.025 }} whileTap={{ scale: 0.97 }}>
              <a
                href="#approach"
                className="l-interactive"
                style={{
                  fontFamily: "var(--font-l-body)",
                  fontWeight: 600,
                  fontSize: "13px",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--l-text)",
                  background: "transparent",
                  border: "1px solid var(--l-border)",
                  padding: "14px 36px",
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                Our Approach
              </a>
            </motion.div>
          </div>
        </FadeUp>

        {/* Stats */}
        <FadeUp delay={1.0}>
          <div
            style={{
              display: "flex",
              gap: "36px",
              marginTop: "56px",
              paddingTop: "32px",
              borderTop: "1px solid var(--l-border)",
              flexWrap: "wrap",
            }}
          >
            {[
              { val: "6", label: "Capabilities" },
              { val: "100%", label: "Private" },
              { val: "Always", label: "Present" },
            ].map(({ val, label }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut", delay: 1.0 + i * 0.08 }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-l-display)",
                    fontStyle: "italic",
                    fontSize: "34px",
                    lineHeight: 1,
                    color: "var(--l-text)",
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
                    color: "var(--l-muted2)",
                    marginTop: "6px",
                  }}
                >
                  {label}
                </div>
              </motion.div>
            ))}
          </div>
        </FadeUp>
      </div>

      {/* ── Ticker strip at bottom ── */}
      <HeroTicker />
    </section>
  );
}
