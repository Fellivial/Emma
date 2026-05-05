import { FEATURE_STRIP } from "@/lib/constants/landing";

function FlowDiagram() {
  const particles1 = [0, 0.45, 0.85];
  const particles2 = [0.2, 0.6, 1.0];

  return (
    <svg
      viewBox="0 0 700 160"
      style={{ width: "100%", height: "auto", display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Hidden motion paths */}
        <path id="flowPath1" d="M 155 80 L 277 80" />
        <path id="flowPath2" d="M 423 80 L 545 80" />
      </defs>

      {/* Connection lines */}
      <line x1="155" y1="80" x2="277" y2="80" stroke="rgba(232,84,122,0.2)" strokeWidth="1" strokeDasharray="4 4" />
      <line x1="423" y1="80" x2="545" y2="80" stroke="rgba(34,197,94,0.2)" strokeWidth="1" strokeDasharray="4 4" />

      {/* Arrow heads */}
      <polygon points="277,75 277,85 288,80" fill="rgba(232,84,122,0.35)" />
      <polygon points="545,75 545,85 556,80" fill="rgba(34,197,94,0.35)" />

      {/* YOUR PRESENCE box */}
      <rect x="10" y="50" width="145" height="60" fill="none" stroke="rgba(232,84,122,0.28)" strokeWidth="1" />
      <text x="82" y="76" textAnchor="middle" fontFamily="monospace" fontSize="8" fill="rgba(232,84,122,0.5)" letterSpacing="1.5">YOUR</text>
      <text x="82" y="93" textAnchor="middle" fontFamily="monospace" fontSize="11" fill="rgba(242,240,234,0.65)" letterSpacing="1.2">PRESENCE</text>

      {/* EMMA box (highlighted) */}
      <rect x="277" y="38" width="146" height="84" fill="rgba(232,84,122,0.08)" stroke="rgba(232,84,122,0.7)" strokeWidth="1.5" />
      {/* Inner concentric ring */}
      <rect x="283" y="44" width="134" height="72" fill="none" stroke="rgba(232,84,122,0.18)" strokeWidth="1" />
      <text x="350" y="90" textAnchor="middle" fontFamily="sans-serif" fontSize="26" fontWeight="bold" fill="#e8547a" letterSpacing="4">EMMA</text>

      {/* RESPONSE box */}
      <rect x="545" y="50" width="145" height="60" fill="none" stroke="rgba(34,197,94,0.28)" strokeWidth="1" />
      <text x="617" y="76" textAnchor="middle" fontFamily="monospace" fontSize="8" fill="rgba(34,197,94,0.5)" letterSpacing="1.5">REAL-TIME</text>
      <text x="617" y="93" textAnchor="middle" fontFamily="monospace" fontSize="11" fill="rgba(242,240,234,0.65)" letterSpacing="1.2">RESPONSE</text>

      {/* Animated particles — path 1 (presence → emma) */}
      {particles1.map((delay, i) => (
        <circle key={`p1-${i}`} r="3.5" fill="#e8547a">
          <animateMotion dur="1.6s" begin={`${delay * 1.6}s`} repeatCount="indefinite">
            <mpath href="#flowPath1" />
          </animateMotion>
          <animate attributeName="opacity" values="0;1;1;0" dur="1.6s" begin={`${delay * 1.6}s`} repeatCount="indefinite" />
        </circle>
      ))}

      {/* Animated particles — path 2 (emma → response) */}
      {particles2.map((delay, i) => (
        <circle key={`p2-${i}`} r="3.5" fill="#22c55e">
          <animateMotion dur="1.6s" begin={`${delay * 1.6}s`} repeatCount="indefinite">
            <mpath href="#flowPath2" />
          </animateMotion>
          <animate attributeName="opacity" values="0;1;1;0" dur="1.6s" begin={`${delay * 1.6}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  );
}

export default function Introducing() {
  return (
    <section id="introducing" style={{ background: "var(--l-bg)", padding: "80px 40px 0" }}>
      {/* Eyebrow + heading */}
      <div style={{ textAlign: "center", marginBottom: "64px" }}>
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
          Architecture
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
          Integrated. Local. Yours.
        </h2>
      </div>

      {/* Architecture diagram */}
      <div
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
          YOUR ENVIRONMENT
        </span>

        {/* Animated flow diagram */}
        <FlowDiagram />

        {/* Blocked boxes */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "16px",
            marginTop: "24px",
            flexWrap: "wrap",
          }}
        >
          {["Cloud API", "Telemetry"].map((label) => (
            <div
              key={label}
              style={{
                border: "1px solid rgba(239,68,68,0.35)",
                padding: "8px 20px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span style={{ color: "var(--l-red)", fontSize: "13px" }}>✕</span>
              <span
                style={{
                  fontFamily: "var(--font-l-mono)",
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "rgba(239,68,68,0.7)",
                }}
              >
                {label} BLOCKED
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Feature strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          border: "1px solid var(--l-border)",
          borderTop: "none",
          gap: "1px",
          background: "var(--l-border)",
        }}
        className="lg:grid-cols-3 grid-cols-1"
      >
        {FEATURE_STRIP.map((feat) => (
          <div
            key={feat.tag}
            style={{
              background: "var(--l-surface)",
              padding: "40px 32px",
            }}
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
          </div>
        ))}
      </div>
    </section>
  );
}
