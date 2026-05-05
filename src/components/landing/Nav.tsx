"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { NAV_LINKS } from "@/lib/constants/landing";

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "var(--l-bg)",
        borderBottom: scrolled
          ? "1px solid var(--l-border2)"
          : "1px solid var(--l-border)",
        transition: "border-color 300ms",
      }}
    >
      <div
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          padding: "0 40px",
          height: "56px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Logo */}
        <Link
          href="/landing"
          className="l-interactive"
          style={{
            fontFamily: "var(--font-l-display)",
            fontSize: "26px",
            letterSpacing: "0.04em",
            color: "var(--l-text)",
            textDecoration: "none",
          }}
        >
          EM<span style={{ color: "var(--l-accent)" }}>M</span>A
        </Link>

        {/* Desktop links */}
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
            aria-label="Get early access to Emma"
            className="l-interactive"
            style={{
              fontFamily: "var(--font-l-body)",
              fontWeight: 700,
              fontSize: "13px",
              color: "var(--l-bg)",
              background: "var(--l-text)",
              padding: "8px 20px",
              textDecoration: "none",
              letterSpacing: "0.03em",
              borderRadius: 0,
              display: "inline-block",
            }}
          >
            Get Early Access
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="flex md:hidden l-interactive"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px",
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
                transform: open
                  ? i === 0
                    ? "translateY(7px) rotate(45deg)"
                    : i === 2
                    ? "translateY(-7px) rotate(-45deg)"
                    : "scaleX(0)"
                  : "none",
                opacity: open && i === 1 ? 0 : 1,
              }}
            />
          ))}
        </button>
      </div>

      {/* Mobile menu */}
      <div
        style={{
          overflow: "hidden",
          maxHeight: open ? "320px" : "0",
          transition: "max-height 280ms ease",
          background: "var(--l-bg)",
          borderTop: open ? "1px solid var(--l-border)" : "none",
        }}
      >
        <div style={{ padding: "16px 40px", display: "flex", flexDirection: "column", gap: "20px" }}>
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setOpen(false)}
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
            onClick={() => setOpen(false)}
            style={{
              fontFamily: "var(--font-l-body)",
              fontWeight: 700,
              fontSize: "14px",
              color: "var(--l-bg)",
              background: "var(--l-text)",
              padding: "12px 20px",
              textDecoration: "none",
              textAlign: "center",
              borderRadius: 0,
            }}
          >
            Get Early Access
          </Link>
        </div>
      </div>
    </nav>
  );
}
