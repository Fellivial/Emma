"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useInView } from "@/lib/hooks/useInView";
import { FAQS } from "@/lib/constants/landing";

function FAQItem({
  n,
  question,
  answer,
  isOpen,
  onToggle,
  onEscape,
  index,
}: {
  n: string;
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
  onEscape: () => void;
  index: number;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const id = `faq-answer-${index}`;

  useEffect(() => {
    if (bodyRef.current) {
      setHeight(bodyRef.current.scrollHeight);
    }
  }, [answer]);

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    } else if (e.key === "Escape") {
      onEscape();
    }
  };

  return (
    <div
      style={{
        borderBottom: "1px solid var(--l-border)",
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-controls={id}
        onClick={onToggle}
        onKeyDown={handleKey}
        className="l-interactive"
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "24px",
          padding: "24px 0",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
          <span
            style={{
              fontFamily: "var(--font-l-mono)",
              fontSize: "10px",
              color: "var(--l-muted2)",
              letterSpacing: "0.1em",
              paddingTop: "3px",
              flexShrink: 0,
            }}
          >
            {n}
          </span>
          <h3
            style={{
              fontFamily: "var(--font-l-cond)",
              fontWeight: 700,
              fontSize: "18px",
              textTransform: "uppercase",
              color: isOpen ? "var(--l-text)" : "var(--l-muted)",
              transition: "color 150ms",
              lineHeight: 1.25,
            }}
          >
            {question}
          </h3>
        </div>
        <span
          style={{
            fontFamily: "var(--font-l-mono)",
            fontSize: "18px",
            color: "var(--l-accent)",
            flexShrink: 0,
            transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 200ms",
            lineHeight: 1,
            paddingTop: "2px",
          }}
        >
          ›
        </span>
      </div>

      <div
        id={id}
        style={{
          overflow: "hidden",
          maxHeight: isOpen ? `${height}px` : "0",
          transition: "max-height 280ms ease",
        }}
      >
        <div ref={bodyRef} style={{ paddingBottom: "24px", paddingLeft: "36px" }}>
          <p
            style={{
              fontFamily: "var(--font-l-body)",
              fontSize: "15px",
              color: "var(--l-muted)",
              lineHeight: 1.7,
            }}
          >
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function FAQ() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const { ref, inView } = useInView<HTMLElement>({ threshold: 0.08 });

  const toggle = (i: number) => setActiveIndex(activeIndex === i ? null : i);
  const closeAll = () => setActiveIndex(null);

  return (
    <section
      id="faq"
      ref={ref}
      style={{
        background: "var(--l-bg)",
        padding: "80px 40px",
        maxWidth: "860px",
        margin: "0 auto",
        opacity: inView ? 1 : 0,
        transform: inView ? "none" : "translateY(24px)",
        transition: "opacity 500ms ease, transform 500ms ease",
      }}
    >
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
        FAQ
      </p>
      <h2
        style={{
          fontFamily: "var(--font-l-cond)",
          fontWeight: 900,
          fontSize: "clamp(32px, 4vw, 52px)",
          textTransform: "uppercase",
          color: "var(--l-text)",
          lineHeight: 1.05,
          marginBottom: "48px",
        }}
      >
        Frequently asked
        <br />
        questions.
      </h2>

      <div style={{ borderTop: "1px solid var(--l-border)" }}>
        {FAQS.map((faq, i) => (
          <FAQItem
            key={faq.n}
            n={faq.n}
            question={faq.question}
            answer={faq.answer}
            isOpen={activeIndex === i}
            onToggle={() => toggle(i)}
            onEscape={closeAll}
            index={i}
          />
        ))}
      </div>
    </section>
  );
}
