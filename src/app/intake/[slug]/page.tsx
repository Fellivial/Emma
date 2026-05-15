"use client";

import { useState, useRef, useEffect, FormEvent } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
}

// ─── Session ID ───────────────────────────────────────────────────────────────

function getSessionId(slug: string): string {
  // Sanitise slug before using in cookie name (A5: cookie slug sanitization)
  const safeSlug = slug.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
  const cookieName = `emma_intake_${safeSlug}`;
  const existing = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${cookieName}=`))
    ?.split("=")[1];

  if (existing) return existing;

  const id = crypto.randomUUID();
  document.cookie = `${cookieName}=${id}; path=/; max-age=86400; SameSite=Strict`;
  return id;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IntakePage({ params }: { params: { slug: string } }) {
  const { slug } = params;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sessionIdRef.current = getSessionId(slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kick off opening greeting only after consent is given
  useEffect(() => {
    if (consented) sendMessage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consented]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(userText: string | null) {
    const sessionId = sessionIdRef.current ?? getSessionId(slug);

    const nextMessages: Message[] =
      userText !== null ? [...messages, { role: "user", content: userText }] : [];

    if (userText !== null) {
      setMessages(nextMessages);
      setInput("");
    }
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/intake/${slug}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, sessionId }),
      });

      if (res.status === 404) {
        setError("This intake page is unavailable.");
        return;
      }
      if (res.status === 429) {
        setError("Too many messages. Please wait a moment and try again.");
        return;
      }

      const data: { reply: string; complete: boolean; leadSaved?: boolean } = await res.json();

      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);

      if (data.complete) setComplete(true);
    } catch {
      setError("Something went wrong. Please refresh and try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading || complete) return;
    sendMessage(text);
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

      {/* Tennessee AI disclosure banner — always visible */}
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

      {/* Consent gate — shown before any PII is collected */}
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
            <h2
              style={{
                margin: 0,
                fontSize: "1.1rem",
                fontWeight: 700,
                color: "#f5f0f7",
              }}
            >
              Before we begin
            </h2>
            <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.6, color: "rgba(255,255,255,0.7)" }}>
              Emma is an AI assistant, not a human. To handle your inquiry, this conversation may
              collect your name, contact details, and messages. Your information will only be used
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
                style={{ marginTop: "0.2rem", accentColor: "var(--l-accent, #e8547a)", cursor: "pointer" }}
              />
              I understand I am chatting with an AI and consent to my information being used to
              respond to my inquiry.
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
              Start chat
            </button>
          </div>
        </main>
      )}

      {/* Message list */}
      {consented && (
      <main
        aria-live="polite"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          maxWidth: 640,
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "80%",
                padding: "0.65rem 1rem",
                borderRadius:
                  msg.role === "user" ? "1rem 1rem 0.25rem 1rem" : "1rem 1rem 1rem 0.25rem",
                background:
                  msg.role === "user" ? "var(--l-accent, #e8547a)" : "rgba(255,255,255,0.08)",
                fontSize: "0.9rem",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                padding: "0.65rem 1rem",
                borderRadius: "1rem 1rem 1rem 0.25rem",
                background: "rgba(255,255,255,0.08)",
                fontSize: "0.9rem",
                color: "rgba(255,255,255,0.4)",
              }}
            >
              ...
            </div>
          </div>
        )}

        {complete && (
          <div
            role="status"
            style={{
              textAlign: "center",
              padding: "1.5rem",
              color: "rgba(255,255,255,0.5)",
              fontSize: "0.85rem",
            }}
          >
            Thanks! Someone will be in touch soon.
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              textAlign: "center",
              padding: "1rem",
              color: "#f87171",
              fontSize: "0.85rem",
            }}
          >
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </main>
      )}

      {/* Input — pinned above keyboard on mobile via flex column layout */}
      {consented && !complete && (
        <form
          onSubmit={handleSubmit}
          style={{
            padding: "1rem 1.5rem",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            gap: "0.5rem",
            background: "#0d0a0e",
            maxWidth: 640,
            width: "100%",
            margin: "0 auto",
            boxSizing: "border-box",
          }}
        >
          <input
            aria-label="Your message"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder="Type a message…"
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "0.5rem",
              padding: "0.65rem 1rem",
              color: "#f5f0f7",
              fontSize: "0.9rem",
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            aria-label="Send"
            style={{
              background: "var(--l-accent, #e8547a)",
              border: "none",
              borderRadius: "0.5rem",
              padding: "0 1.25rem",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: "0.9rem",
              opacity: !input.trim() || loading ? 0.5 : 1,
            }}
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}
