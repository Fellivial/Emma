"use client";

import { useState, useRef } from "react";
import ScanLines from "./ScanLines";

type FormState = "idle" | "loading" | "success" | "error";

export default function Waitlist() {
  const [state, setState] = useState<FormState>("idle");
  const [position, setPosition] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = emailRef.current?.value?.trim() ?? "";
    if (!email || !email.includes("@")) {
      setErrorMsg("Enter a valid email address.");
      setState("error");
      return;
    }

    setState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (res.ok || data.result === "waitlisted" || data.result === "accepted") {
        setPosition(data.position ?? null);
        setState("success");
      } else {
        setErrorMsg(data.error ?? "Something went wrong. Try again.");
        setState("error");
      }
    } catch {
      setErrorMsg("Connection error. Please try again.");
      setState("error");
    }
  };

  return (
    <section
      id="waitlist"
      style={{ background: "var(--l-bg)" }}
    >
      <ScanLines direction="rtl" />

      <div
        style={{
          padding: "80px 40px",
          maxWidth: "640px",
          margin: "0 auto",
          textAlign: "center",
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
          Early Access
        </p>
        <h2
          style={{
            fontFamily: "var(--font-l-cond)",
            fontWeight: 900,
            fontSize: "clamp(32px, 4vw, 52px)",
            textTransform: "uppercase",
            color: "var(--l-text)",
            lineHeight: 1.05,
            marginBottom: "16px",
          }}
        >
          Join the waitlist.
        </h2>
        <p
          style={{
            fontFamily: "var(--font-l-body)",
            fontSize: "15px",
            color: "var(--l-muted)",
            lineHeight: 1.65,
            marginBottom: "40px",
          }}
        >
          We onboard personally. No spam, no automation.
        </p>

        {state === "success" ? (
          <div
            style={{
              border: "1px solid rgba(34,197,94,0.3)",
              background: "rgba(34,197,94,0.06)",
              padding: "32px",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-l-display)",
                fontSize: "32px",
                color: "var(--l-green)",
                marginBottom: "8px",
              }}
            >
              You&apos;re on the list.
            </p>
            {position !== null && (
              <p
                style={{
                  fontFamily: "var(--font-l-mono)",
                  fontSize: "12px",
                  color: "var(--l-muted2)",
                  letterSpacing: "0.1em",
                }}
              >
                Position: #{position}
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div
              style={{
                display: "flex",
                border: "1px solid var(--l-border2)",
              }}
            >
              <input
                ref={emailRef}
                type="email"
                placeholder="your@email.com"
                required
                aria-label="Email address"
                style={{
                  flex: 1,
                  background: "var(--l-surface)",
                  border: "none",
                  outline: "none",
                  padding: "14px 20px",
                  fontFamily: "var(--font-l-mono)",
                  fontSize: "13px",
                  color: "var(--l-text)",
                  borderRadius: 0,
                }}
              />
              <button
                type="submit"
                disabled={state === "loading"}
                className="l-interactive"
                style={{
                  background: "var(--l-accent)",
                  border: "none",
                  color: "var(--l-accent-dark)",
                  fontFamily: "var(--font-l-body)",
                  fontWeight: 700,
                  fontSize: "13px",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  padding: "14px 28px",
                  cursor: state === "loading" ? "wait" : "pointer",
                  borderRadius: 0,
                  whiteSpace: "nowrap",
                  opacity: state === "loading" ? 0.7 : 1,
                }}
              >
                {state === "loading" ? "Joining..." : "Join Waitlist"}
              </button>
            </div>
            {state === "error" && errorMsg && (
              <p
                style={{
                  fontFamily: "var(--font-l-mono)",
                  fontSize: "12px",
                  color: "var(--l-red)",
                  marginTop: "10px",
                  textAlign: "left",
                }}
              >
                {errorMsg}
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
