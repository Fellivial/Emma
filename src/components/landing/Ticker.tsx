import { TICKER_ITEMS } from "@/lib/constants/landing";

export default function Ticker() {
  return (
    <div
      style={{
        background: "var(--l-surface)",
        borderBottom: "1px solid var(--l-border)",
        padding: "12px 0",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Fade masks */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "80px",
          background: "linear-gradient(to right, var(--l-surface), transparent)",
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
          background: "linear-gradient(to left, var(--l-surface), transparent)",
          zIndex: 1,
          pointerEvents: "none",
        }}
      />

      {/* Track wrapper — two identical tracks for seamless loop */}
      <div style={{ display: "flex", width: "max-content" }}>
        {/* Primary track */}
        <div
          className="ticker-track"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0",
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
              <span aria-hidden="true" style={{ color: "var(--l-accent)", fontSize: "11px" }}>
                •
              </span>
            </span>
          ))}
        </div>

        {/* Duplicate for seamless loop */}
        <div
          aria-hidden="true"
          className="ticker-track"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0",
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
              <span aria-hidden="true" style={{ color: "var(--l-accent)", fontSize: "11px" }}>
                •
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
