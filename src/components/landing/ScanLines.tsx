"use client";

import { useEffect, useRef } from "react";
import { useInView } from "@/lib/hooks/useInView";

interface ScanLinesProps {
  direction?: "ltr" | "rtl";
}

export default function ScanLines({ direction = "ltr" }: ScanLinesProps) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.5 });
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!inView) return;
    barsRef.current.forEach((bar, i) => {
      if (!bar) return;
      bar.style.transitionDelay = `${i * 60}ms`;
      bar.style.transform = "scaleX(1)";
    });
  }, [inView]);

  return (
    <div
      ref={ref}
      style={{
        padding: "20px 0",
        display: "flex",
        flexDirection: "column",
        gap: "5px",
        background: "var(--l-bg)",
      }}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          style={{
            height: "3px",
            background: "var(--l-accent)",
            opacity: 0.75,
            transform: "scaleX(0)",
            transformOrigin: direction === "ltr" ? "left" : "right",
            transition: "transform 400ms ease",
          }}
        />
      ))}
    </div>
  );
}
