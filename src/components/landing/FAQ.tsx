"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { FAQS } from "@/lib/constants/landing";

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

const itemVariant = {
  hidden: { opacity: 0, x: -20 },
  show: { opacity: 1, x: 0, transition: { duration: 0.5, ease } },
};

const wipeLine = {
  hidden: { clipPath: "inset(0 0 100% 0)", opacity: 0 },
  show: { clipPath: "inset(0 0 0% 0)", opacity: 1, transition: { duration: 0.65, ease } },
};

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
    if (bodyRef.current) setHeight(bodyRef.current.scrollHeight);
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
    <motion.div variants={itemVariant} style={{ borderBottom: "1px solid var(--l-border)" }}>
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
    </motion.div>
  );
}

export default function FAQ() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggle = (i: number) => setActiveIndex(activeIndex === i ? null : i);
  const closeAll = () => setActiveIndex(null);

  return (
    <section
      id="faq"
      style={{
        background: "var(--l-bg)",
        padding: "80px 40px",
        maxWidth: "860px",
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.5 }}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.14 } } }}
        style={{ marginBottom: "48px" }}
      >
        <motion.p
          variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.4 } } }}
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
        </motion.p>
        <div style={{ overflow: "hidden" }}>
          <motion.h2
            variants={wipeLine}
            style={{
              fontFamily: "var(--font-l-cond)",
              fontWeight: 900,
              fontSize: "clamp(32px, 4vw, 52px)",
              textTransform: "uppercase",
              color: "var(--l-text)",
              lineHeight: 1.05,
            }}
          >
            Frequently asked
            <br />
            questions.
          </motion.h2>
        </div>
      </motion.div>

      {/* FAQ items — slide from left */}
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.05 }}
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
        }}
        style={{ borderTop: "1px solid var(--l-border)" }}
      >
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
      </motion.div>
    </section>
  );
}
