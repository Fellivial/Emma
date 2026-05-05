import Link from "next/link";

export default function FinalCTA() {
  return (
    <section
      style={{
        background: "var(--l-surface)",
        position: "relative",
        overflow: "hidden",
        padding: "96px 40px",
        textAlign: "center",
      }}
    >
      {/* Vortex grid — inline style, masked radial ellipse */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(232,84,122,0.08) 0px, rgba(232,84,122,0.08) 1px, transparent 1px, transparent 52px), repeating-linear-gradient(90deg, rgba(232,84,122,0.08) 0px, rgba(232,84,122,0.08) 1px, transparent 1px, transparent 52px)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 80% at center, black, transparent)",
          maskImage:
            "radial-gradient(ellipse 80% 80% at center, black, transparent)",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
        <p
          style={{
            fontFamily: "var(--font-l-mono)",
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            color: "var(--l-accent)",
            marginBottom: "20px",
          }}
        >
          Ready?
        </p>
        <h2
          style={{
            fontFamily: "var(--font-l-cond)",
            fontWeight: 900,
            fontSize: "clamp(36px, 5vw, 64px)",
            textTransform: "uppercase",
            color: "var(--l-text)",
            lineHeight: 1.0,
            marginBottom: "48px",
          }}
        >
          Break free from
          <br />
          generic AI.
        </h2>

        <Link
          href="/register"
          className="l-interactive"
          style={{
            display: "block",
            maxWidth: "520px",
            margin: "0 auto",
            background: "var(--l-accent)",
            fontFamily: "var(--font-l-display)",
            fontSize: "clamp(20px, 2.5vw, 28px)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: "var(--l-accent-dark)",
            padding: "20px 40px",
            textDecoration: "none",
            borderRadius: 0,
          }}
        >
          Request Early Access ↵
        </Link>
      </div>
    </section>
  );
}
