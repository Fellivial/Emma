"use client";

import { useState, FormEvent } from "react";
import type { FormStep, FormField } from "@/core/client-config";

// ─── Component ────────────────────────────────────────────────────────────────

export default function IntakeForm({ slug, steps }: { slug: string; steps: FormStep[] }) {
  const [consented, setConsented] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  function validateStep(): boolean {
    const newErrors: Record<string, string> = {};
    for (const field of step.fields) {
      if (field.required && !formData[field.id]?.trim()) {
        newErrors[field.id] = `${field.label} is required.`;
      }
      if (field.type === "email" && formData[field.id]) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData[field.id])) {
          newErrors[field.id] = "Please enter a valid email address.";
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleFieldChange(fieldId: string, value: string) {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
    if (errors[fieldId]) setErrors((prev) => ({ ...prev, [fieldId]: "" }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validateStep()) return;

    if (!isLastStep) {
      setCurrentStep((s) => s + 1);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`/api/intake/${slug}/form`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formData, sessionId: crypto.randomUUID() }),
      });

      if (res.status === 429) {
        setSubmitError("Too many submissions. Please try again later.");
        return;
      }
      if (!res.ok) {
        setSubmitError("Something went wrong. Please try again.");
        return;
      }

      setSubmitted(true);
    } catch {
      setSubmitError("Something went wrong. Please refresh and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function renderField(field: FormField) {
    const value = formData[field.id] ?? "";
    const err = errors[field.id];

    const inputBase: React.CSSProperties = {
      width: "100%",
      background: "rgba(255,255,255,0.06)",
      border: `1px solid ${err ? "#f87171" : "rgba(255,255,255,0.12)"}`,
      borderRadius: "0.5rem",
      padding: "0.65rem 1rem",
      color: "#f5f0f7",
      fontSize: "0.9rem",
      outline: "none",
      boxSizing: "border-box",
      fontFamily: "Outfit, sans-serif",
    };

    return (
      <div key={field.id} style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        <label
          htmlFor={field.id}
          style={{ fontSize: "0.85rem", fontWeight: 500, color: "rgba(255,255,255,0.75)" }}
        >
          {field.label}
          {field.required && (
            <span style={{ color: "var(--l-accent, #e8547a)", marginLeft: "0.25rem" }}>*</span>
          )}
        </label>

        {field.type === "textarea" ? (
          <textarea
            id={field.id}
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            rows={4}
            style={{ ...inputBase, resize: "vertical" }}
          />
        ) : field.type === "select" && field.options?.length ? (
          <select
            id={field.id}
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            style={{ ...inputBase, cursor: "pointer" }}
          >
            <option value="">Select…</option>
            {field.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : field.type === "radio" && field.options?.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {field.options.map((opt) => (
              <label
                key={opt}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontSize: "0.875rem",
                  color: "rgba(255,255,255,0.8)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name={field.id}
                  value={opt}
                  checked={value === opt}
                  onChange={() => handleFieldChange(field.id, opt)}
                  style={{ accentColor: "var(--l-accent, #e8547a)", cursor: "pointer" }}
                />
                {opt}
              </label>
            ))}
          </div>
        ) : (
          <input
            id={field.id}
            type={field.type}
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            style={inputBase}
          />
        )}

        {err && <span style={{ fontSize: "0.78rem", color: "#f87171" }}>{err}</span>}
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--l-bg, #0d0a0e)",
        color: "#f5f0f7",
        fontFamily: "Outfit, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: "1rem 1.5rem",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "var(--l-accent, #e8547a)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 700,
            color: "#fff",
          }}
        >
          E
        </div>
        <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>Emma</span>
      </header>

      {/* AI disclosure banner */}
      <div
        aria-label="AI disclosure"
        style={{
          background: "rgba(255,255,255,0.04)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          padding: "0.5rem 1.5rem",
          fontSize: "0.75rem",
          color: "rgba(255,255,255,0.5)",
          textAlign: "center",
        }}
      >
        This service uses artificial intelligence. You are interacting with an AI, not a human.
      </div>

      {/* Consent gate */}
      {!consented && (
        <main
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem 1.5rem",
          }}
        >
          <div
            style={{
              maxWidth: 480,
              width: "100%",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "1rem",
              padding: "2rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#f5f0f7" }}>
              Before we begin
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: "0.9rem",
                lineHeight: 1.6,
                color: "rgba(255,255,255,0.7)",
              }}
            >
              Emma is an AI assistant, not a human. To handle your inquiry, this form may collect
              your name, contact details, and other information. Your information will only be used
              to respond to your request.
            </p>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.75rem",
                cursor: "pointer",
                fontSize: "0.875rem",
                color: "rgba(255,255,255,0.85)",
                lineHeight: 1.5,
              }}
            >
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                style={{
                  marginTop: "0.2rem",
                  accentColor: "var(--l-accent, #e8547a)",
                  cursor: "pointer",
                }}
              />
              I understand I am interacting with an AI system and consent to my information being
              used to respond to my inquiry.
            </label>
            <button
              onClick={() => setConsented(true)}
              disabled={!consentChecked}
              style={{
                background: "var(--l-accent, #e8547a)",
                border: "none",
                borderRadius: "0.5rem",
                padding: "0.75rem 1.5rem",
                color: "#fff",
                fontWeight: 600,
                fontSize: "0.9rem",
                cursor: consentChecked ? "pointer" : "not-allowed",
                opacity: consentChecked ? 1 : 0.4,
                alignSelf: "flex-start",
              }}
            >
              Continue
            </button>
          </div>
        </main>
      )}

      {/* Form */}
      {consented && !submitted && (
        <main
          style={{
            flex: 1,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "2rem 1.5rem",
          }}
        >
          <div style={{ maxWidth: 520, width: "100%" }}>
            {/* Step progress */}
            {steps.length > 1 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "1.5rem",
                }}
              >
                {steps.map((s, i) => (
                  <div
                    key={s.id}
                    style={{
                      height: 3,
                      flex: 1,
                      borderRadius: 4,
                      background:
                        i <= currentStep
                          ? "var(--l-accent, #e8547a)"
                          : "rgba(255,255,255,0.12)",
                      transition: "background 0.2s",
                    }}
                  />
                ))}
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "rgba(255,255,255,0.35)",
                    whiteSpace: "nowrap",
                    marginLeft: "0.25rem",
                  }}
                >
                  {currentStep + 1} / {steps.length}
                </span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "1rem",
                  padding: "2rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.25rem",
                }}
              >
                <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#f5f0f7" }}>
                  {step.title}
                </h2>

                {step.fields.map(renderField)}

                {submitError && (
                  <p role="alert" style={{ margin: 0, fontSize: "0.85rem", color: "#f87171" }}>
                    {submitError}
                  </p>
                )}

                <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.25rem" }}>
                  {currentStep > 0 && (
                    <button
                      type="button"
                      onClick={() => setCurrentStep((s) => s - 1)}
                      style={{
                        background: "transparent",
                        border: "1px solid rgba(255,255,255,0.2)",
                        borderRadius: "0.5rem",
                        padding: "0.7rem 1.25rem",
                        color: "rgba(255,255,255,0.7)",
                        fontWeight: 500,
                        fontSize: "0.9rem",
                        cursor: "pointer",
                      }}
                    >
                      Back
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      background: "var(--l-accent, #e8547a)",
                      border: "none",
                      borderRadius: "0.5rem",
                      padding: "0.7rem 1.5rem",
                      color: "#fff",
                      fontWeight: 600,
                      fontSize: "0.9rem",
                      cursor: submitting ? "not-allowed" : "pointer",
                      opacity: submitting ? 0.6 : 1,
                    }}
                  >
                    {submitting ? "Submitting…" : isLastStep ? "Submit" : "Next"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </main>
      )}

      {/* Success state */}
      {submitted && (
        <main
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem 1.5rem",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 400 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "rgba(52,211,153,0.15)",
                border: "1px solid rgba(52,211,153,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                margin: "0 auto 1.25rem",
              }}
            >
              ✓
            </div>
            <p style={{ margin: "0 0 0.5rem", fontWeight: 600, fontSize: "1rem" }}>Thank you!</p>
            <p style={{ margin: 0, fontSize: "0.875rem", color: "rgba(255,255,255,0.45)" }}>
              Your information has been received. Someone will be in touch soon.
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
