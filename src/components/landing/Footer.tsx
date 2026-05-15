import Link from "next/link";

const FOOTER_LINKS = [
  { label: "Capabilities", href: "#capabilities" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

const LEGAL_LINKS = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer
      style={{
        background: "var(--l-bg)",
        borderTop: "1px solid var(--l-border)",
      }}
    >
      {/* Main grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto auto",
          gap: "48px",
          padding: "40px 40px",
          alignItems: "start",
        }}
        className="md:grid-cols-[1fr_auto_auto] grid-cols-1"
      >
        {/* Brand */}
        <div>
          <Link
            href="/landing"
            style={{
              fontFamily: "var(--font-l-display)",
              fontSize: "24px",
              letterSpacing: "0.04em",
              color: "var(--l-text)",
              textDecoration: "none",
              display: "inline-block",
              marginBottom: "12px",
            }}
          >
            EM<span style={{ color: "var(--l-accent)" }}>M</span>A
          </Link>
          <p
            style={{
              fontFamily: "var(--font-l-body)",
              fontSize: "13px",
              color: "var(--l-muted2)",
              lineHeight: 1.65,
              maxWidth: "260px",
            }}
          >
            A vertically-integrated AI companion system.
          </p>
        </div>

        {/* Nav links */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {FOOTER_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              style={{
                fontFamily: "var(--font-l-body)",
                fontSize: "13px",
                color: "var(--l-muted)",
                textDecoration: "none",
              }}
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Legal links */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              style={{
                fontFamily: "var(--font-l-body)",
                fontSize: "13px",
                color: "var(--l-muted)",
                textDecoration: "none",
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Bottom strip */}
      <div
        style={{
          borderTop: "1px solid var(--l-border)",
          padding: "16px 40px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-l-mono)",
            fontSize: "10px",
            color: "var(--l-muted2)",
            letterSpacing: "0.08em",
          }}
        >
          © {year} Emma. All rights reserved.
        </span>
        <span
          style={{
            fontFamily: "var(--font-l-mono)",
            fontSize: "10px",
            color: "var(--l-muted2)",
            letterSpacing: "0.08em",
            textAlign: "center",
            flex: "1 1 auto",
          }}
        >
          This service uses artificial intelligence. You are interacting with an AI, not a human.
        </span>
        <span
          style={{
            fontFamily: "var(--font-l-mono)",
            fontSize: "10px",
            color: "var(--l-muted2)",
            letterSpacing: "0.08em",
          }}
        >
          All systems{" "}
          <span style={{ color: "var(--l-green)" }}>online</span>
        </span>
      </div>
    </footer>
  );
}
