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
  const sessionIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Seed greeting on mount
  useEffect(() => {
    sessionIdRef.current = getSessionId(slug);
    sendMessage(null); // kick off with empty user turn to get opening greeting
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      {/* Tennessee AI disclosure banner */}
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

      {/* Message list */}
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

      {/* Input — pinned above keyboard on mobile via flex column layout */}
      {!complete && (
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
