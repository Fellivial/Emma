"use client";

import { useInView } from "@/lib/hooks/useInView";
import { useCountUp } from "@/lib/hooks/useCountUp";
import { STATS } from "@/lib/constants/landing";

function StatCell({ label, value, sub, numeric, enabled }: {
  label: string;
  value: string;
  sub: string;
  numeric?: number;
  enabled: boolean;
}) {
  const count = useCountUp(numeric ?? 0, 1400, enabled && numeric !== undefined);
  const display = numeric !== undefined ? String(count) : value;

  return (
    <div
      style={{
        padding: "48px 32px",
        borderRight: "1px solid var(--l-border)",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-l-mono)",
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "0.16em",
          color: "var(--l-accent)",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: "var(--font-l-display)",
          fontSize: "72px",
          lineHeight: 0.92,
          letterSpacing: "-0.02em",
          color: "var(--l-text)",
        }}
      >
        {display}
      </p>
      <p
        style={{
          fontFamily: "var(--font-l-mono)",
          fontSize: "11px",
          letterSpacing: "0.08em",
          color: "var(--l-muted2)",
        }}
      >
        {sub}
      </p>
    </div>
  );
}

export default function StatsStrip() {
  const { ref, inView } = useInView<HTMLElement>({ threshold: 0.2 });

  return (
    <section
      ref={ref}
      style={{
        background: "var(--l-bg)",
        borderBottom: "1px solid var(--l-border)",
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        opacity: inView ? 1 : 0,
        transform: inView ? "none" : "translateY(24px)",
        transition: "opacity 500ms ease, transform 500ms ease",
      }}
      className="lg:grid-cols-4 sm:grid-cols-2 grid-cols-1"
    >
      {STATS.map((stat) => (
        <StatCell
          key={stat.label}
          label={stat.label}
          value={stat.value}
          sub={stat.sub}
          numeric={stat.numeric}
          enabled={inView}
        />
      ))}
    </section>
  );
}
