"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { ExternalLink, X, ChevronDown } from "lucide-react";

interface IntegrationStatus {
  status: "connected" | "disconnected" | "auth_expired" | "error";
  accountIdentifier: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
  voiceId?: string | null;
  voiceName?: string;
}

interface VoiceOption {
  voiceId: string;
  name: string;
  category: "cloned" | "generated" | "premade" | "professional";
  previewUrl: string | null;
}

type ELSetupStep = "idle" | "connecting" | "select_voice" | "connected";

const OTHER_SERVICES = [
  {
    id: "gmail",
    name: "Gmail",
    icon: "📧",
    description: "Send emails on your behalf via the send_email tool",
    authType: "oauth" as const,
    oauthUrl: "/api/integrations/gmail/oauth/start",
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    icon: "📅",
    description: "Create events via the book_appointment tool",
    authType: "oauth" as const,
    oauthUrl: "/api/integrations/google_calendar/oauth/start",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    icon: "🔗",
    description: "Log interactions to your CRM",
    authType: "api_key" as const,
  },
];

export default function IntegrationsPage() {
  const [statuses, setStatuses] = useState<Record<string, IntegrationStatus>>({});
  const [loading, setLoading] = useState(true);
  const [hubspotKey, setHubspotKey] = useState("");
  const [hubspotSaving, setHubspotSaving] = useState(false);
  const [showHubspotInput, setShowHubspotInput] = useState(false);

  const fetchStatuses = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/status");
      const data = await res.json();
      setStatuses(data.integrations || {});
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStatuses();
  }, [fetchStatuses]);

  const handleDisconnect = async (service: string) => {
    await fetch("/api/integrations/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service }),
    });
    fetchStatuses();
  };

  const handleHubspotSave = async () => {
    if (!hubspotKey.trim()) return;
    setHubspotSaving(true);
    await fetch("/api/integrations/hubspot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: hubspotKey.trim() }),
    });
    setHubspotKey("");
    setShowHubspotInput(false);
    setHubspotSaving(false);
    fetchStatuses();
  };

  const elStatus = statuses["elevenlabs"] || {
    status: "disconnected",
    accountIdentifier: null,
    lastUsedAt: null,
    lastError: null,
  };

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-light text-emma-100">Integrations</h1>
        <p className="text-xs text-emma-300/50 mt-1">
          Connect external services to extend Emma's capabilities.
        </p>
      </div>
      {loading ? (
        <div className="text-center text-sm text-emma-200/20 py-12">Loading integrations…</div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* ── ElevenLabs (BYOK TTS) — always first ────────────────────── */}
          <ElevenLabsCard
            status={elStatus}
            onConnected={fetchStatuses}
            onDisconnect={() => handleDisconnect("elevenlabs")}
          />

          {/* ── Other integrations ───────────────────────────────────────── */}
          {OTHER_SERVICES.map((svc) => {
            const status = statuses[svc.id] || {
              status: "disconnected",
              accountIdentifier: null,
              lastUsedAt: null,
              lastError: null,
            };
            const isConnected = status.status === "connected";
            const isExpired = status.status === "auth_expired";
            const isError = status.status === "error";

            return (
              <div key={svc.id} className="rounded-xl border border-surface-border bg-surface p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{svc.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-emma-200/70">{svc.name}</h3>
                        <StatusBadge status={status.status} />
                      </div>
                      <p className="text-[11px] font-light text-emma-200/30 mt-0.5">
                        {svc.description}
                      </p>
                    </div>
                  </div>
                  {isConnected && (
                    <button
                      onClick={() => handleDisconnect(svc.id)}
                      className="text-[11px] text-red-300/40 hover:text-red-300/70 cursor-pointer transition-colors"
                    >
                      Disconnect
                    </button>
                  )}
                </div>

                {isConnected && (
                  <div className="mt-3 flex items-center gap-4 text-[11px] text-emma-200/25">
                    {status.accountIdentifier && <span>{status.accountIdentifier}</span>}
                    {status.lastUsedAt && <span>Last used {fmtTime(status.lastUsedAt)}</span>}
                  </div>
                )}

                {isError && status.lastError && (
                  <div className="mt-3 text-[11px] text-red-300/50 bg-red-400/5 rounded-lg px-3 py-2">
                    {status.lastError}
                  </div>
                )}

                {(!isConnected || isExpired) && (
                  <div className="mt-4">
                    {svc.authType === "oauth" && (
                      <a
                        href={svc.oauthUrl}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emma-300/10 border border-emma-300/15 text-xs text-emma-300 hover:bg-emma-300/15 transition-all"
                      >
                        <ExternalLink size={12} />
                        {isExpired ? "Reconnect" : "Connect"} {svc.name}
                      </a>
                    )}

                    {svc.authType === "api_key" && !showHubspotInput && (
                      <button
                        onClick={() => setShowHubspotInput(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emma-300/10 border border-emma-300/15 text-xs text-emma-300 hover:bg-emma-300/15 transition-all cursor-pointer"
                      >
                        Connect {svc.name}
                      </button>
                    )}

                    {svc.authType === "api_key" && showHubspotInput && (
                      <div className="flex items-center gap-2">
                        <input
                          value={hubspotKey}
                          onChange={(e) => setHubspotKey(e.target.value)}
                          placeholder="Paste your HubSpot API key"
                          className="flex-1 bg-emma-200/3 border border-emma-200/8 rounded-lg px-3 py-2 text-xs text-emma-100 placeholder:text-emma-200/15 outline-none"
                        />
                        <button
                          onClick={handleHubspotSave}
                          disabled={!hubspotKey.trim() || hubspotSaving}
                          className="px-3 py-2 rounded-lg bg-emma-300/15 text-xs text-emma-300 cursor-pointer disabled:opacity-30 transition-opacity"
                        >
                          {hubspotSaving ? "…" : "Save"}
                        </button>
                        <button
                          onClick={() => {
                            setShowHubspotInput(false);
                            setHubspotKey("");
                          }}
                          className="text-emma-200/20 hover:text-emma-200/40 cursor-pointer"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Coming soon */}
          <div className="rounded-xl border border-surface-border/50 bg-surface/50 p-5 opacity-50">
            <div className="flex items-center gap-3">
              <span className="text-2xl">💬</span>
              <div>
                <h3 className="text-sm font-medium text-emma-200/40">Slack · Notion</h3>
                <p className="text-[11px] text-emma-200/15">Coming soon</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ElevenLabs Card with two-step flow ────────────────────────────────────────

function ElevenLabsCard({
  status,
  onConnected,
  onDisconnect,
}: {
  status: IntegrationStatus;
  onConnected: () => void;
  onDisconnect: () => void;
}) {
  const [step, setStep] = useState<ELSetupStep>(
    status.status === "connected" ? "connected" : "idle"
  );
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVoiceSelector, setShowVoiceSelector] = useState(false);

  // Keep step in sync if status changes externally
  useEffect(() => {
    if (status.status === "connected" && step !== "select_voice") setStep("connected");
    if (status.status !== "connected" && step === "connected") setStep("idle");
  }, [status.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnectKey = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/elevenlabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Connection failed");
        setSaving(false);
        return;
      }
      setApiKey("");
      setStep("select_voice");
      onConnected();
    } catch {
      setError("Connection failed — try again");
    }
    setSaving(false);
  };

  const isExpired = status.status === "auth_expired";

  return (
    <div className="rounded-xl border border-emma-300/15 bg-emma-300/3 p-5">
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔊</span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-emma-200/70">ElevenLabs</h3>
              <StatusBadge status={status.status} />
            </div>
            <p className="text-[11px] font-light text-emma-200/30 mt-0.5">
              Connect your ElevenLabs API key to upgrade Emma's voice from Web Speech to neural TTS.
              Any plan — bring your own key.
            </p>
            <p className="text-[10px] text-emma-300/40 mt-0.5">Powers: Voice (TTS)</p>
          </div>
        </div>
        {step === "connected" && (
          <button
            onClick={onDisconnect}
            className="text-[11px] text-red-300/40 hover:text-red-300/70 cursor-pointer transition-colors shrink-0"
          >
            Disconnect
          </button>
        )}
      </div>

      {/* ── Step: idle / auth_expired — API key input ─────────────────── */}
      {(step === "idle" || isExpired) && (
        <div className="mt-4">
          {isExpired && (
            <p className="text-[11px] text-amber-300/60 mb-3">
              Your key was rejected. Generate a new one at elevenlabs.io
            </p>
          )}
          <label className="text-[10px] text-emma-200/30 block mb-1.5">API Key</label>
          <div className="flex items-center gap-2">
            <input
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleConnectKey()}
              placeholder="sk_..."
              className="flex-1 bg-emma-200/3 border border-emma-200/8 rounded-lg px-3 py-2 text-xs text-emma-100 placeholder:text-emma-200/15 outline-none focus:border-emma-300/20"
            />
            <button
              onClick={handleConnectKey}
              disabled={!apiKey.trim() || saving}
              className="px-4 py-2 rounded-lg bg-emma-300/15 border border-emma-300/20 text-xs text-emma-300 cursor-pointer disabled:opacity-30 hover:bg-emma-300/20 transition-all"
            >
              {saving ? "…" : "Connect →"}
            </button>
          </div>
          {error && <p className="text-[11px] text-red-300/60 mt-2">{error}</p>}
          <p className="text-[10px] text-emma-200/20 mt-2">
            Get your API key at{" "}
            <a
              href="https://elevenlabs.io/app/settings/api-keys"
              target="_blank"
              rel="noreferrer"
              className="text-emma-300/40 hover:text-emma-300 underline"
            >
              elevenlabs.io → Profile → API Keys
            </a>
          </p>
          <p className="text-[10px] text-emma-200/15 mt-3">
            Emma will use Web Speech TTS until a key is connected. Your key is encrypted at rest and
            never exposed to other users.
          </p>
        </div>
      )}

      {/* ── Step: select_voice — after key saved ──────────────────────── */}
      {step === "select_voice" && (
        <div className="mt-4">
          <p className="text-[11px] text-emerald-300/70 mb-4">
            Connected! Now choose Emma's voice, or skip to use Rachel (default).
          </p>
          <VoiceSelector
            onSaved={(voiceName) => {
              setStep("connected");
              onConnected();
              void voiceName;
            }}
            onSkip={() => {
              setStep("connected");
              onConnected();
            }}
          />
        </div>
      )}

      {/* ── Step: connected ───────────────────────────────────────────── */}
      {step === "connected" && (
        <div className="mt-3">
          <div className="flex items-center gap-4 text-[11px] text-emma-200/25 mb-3">
            {status.accountIdentifier && <span>{status.accountIdentifier}</span>}
            <span className="text-emma-300/50">🎙️ {status.voiceName || "Rachel (default)"}</span>
            {status.lastUsedAt && <span>Last used {fmtTime(status.lastUsedAt)}</span>}
          </div>

          {!showVoiceSelector ? (
            <button
              onClick={() => setShowVoiceSelector(true)}
              className="text-[11px] text-emma-300/50 hover:text-emma-300 cursor-pointer transition-colors"
            >
              Change voice →
            </button>
          ) : (
            <div className="border-t border-surface-border pt-3">
              <VoiceSelector
                initialVoiceId={status.voiceId ?? undefined}
                onSaved={(voiceName) => {
                  setShowVoiceSelector(false);
                  onConnected();
                  void voiceName;
                }}
                onSkip={() => setShowVoiceSelector(false)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Voice Selector Component ──────────────────────────────────────────────────

function VoiceSelector({
  initialVoiceId,
  onSaved,
  onSkip,
}: {
  initialVoiceId?: string;
  onSaved: (voiceName: string) => void;
  onSkip: () => void;
}) {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(initialVoiceId || "");
  const [manualVoiceId, setManualVoiceId] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch("/api/integrations/elevenlabs/voices")
      .then((r) => r.json())
      .then((d) => {
        if (d.voices) {
          setVoices(d.voices);
          if (!selectedVoiceId && d.voices.length > 0) {
            setSelectedVoiceId(d.voices[0].voiceId);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingVoices(false));

    return () => {
      audioPreviewRef.current?.pause();
      audioPreviewRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePreview = (voice: VoiceOption) => {
    if (!voice.previewUrl) return;
    if (playingVoiceId === voice.voiceId) {
      audioPreviewRef.current?.pause();
      audioPreviewRef.current = null;
      setPlayingVoiceId(null);
      return;
    }
    audioPreviewRef.current?.pause();
    const audio = new Audio(voice.previewUrl);
    audioPreviewRef.current = audio;
    setPlayingVoiceId(voice.voiceId);
    audio.onended = () => setPlayingVoiceId(null);
    audio.onerror = () => setPlayingVoiceId(null);
    audio.play().catch(() => setPlayingVoiceId(null));
  };

  const handleSave = async () => {
    const voiceId = showManual ? manualVoiceId.trim() : selectedVoiceId;
    if (!voiceId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/elevenlabs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save voice");
        setSaving(false);
        return;
      }
      setSuccess(`Voice saved — Emma will use ${data.voiceName}.`);
      setTimeout(() => {
        onSaved(data.voiceName);
      }, 1200);
    } catch {
      setError("Failed to save voice");
    }
    setSaving(false);
  };

  // Group voices by category
  const userVoices = voices.filter((v) => v.category === "cloned" || v.category === "generated");
  const premadeVoices = voices.filter((v) => v.category !== "cloned" && v.category !== "generated");

  if (loadingVoices) {
    return <p className="text-[11px] text-emma-200/25 py-2">Loading your voices…</p>;
  }

  return (
    <div>
      <label className="text-[10px] text-emma-200/30 block mb-1.5">Select a voice</label>

      {voices.length > 0 && !showManual && (
        <div className="flex items-center gap-2 mb-2">
          <div className="relative flex-1">
            <select
              value={selectedVoiceId}
              onChange={(e) => setSelectedVoiceId(e.target.value)}
              className="w-full bg-emma-200/3 border border-emma-200/8 rounded-lg px-3 py-2 text-xs text-emma-100 outline-none appearance-none cursor-pointer"
            >
              {userVoices.length > 0 && (
                <optgroup label="Your voices">
                  {userVoices.map((v) => (
                    <option key={v.voiceId} value={v.voiceId}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Premade voices">
                {premadeVoices.map((v) => (
                  <option key={v.voiceId} value={v.voiceId}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <ChevronDown
              size={12}
              className="absolute right-2.5 top-2.5 text-emma-200/20 pointer-events-none"
            />
          </div>

          {/* Preview button */}
          {(() => {
            const sel = voices.find((v) => v.voiceId === selectedVoiceId);
            return sel?.previewUrl ? (
              <button
                onClick={() => handlePreview(sel)}
                className="px-3 py-2 rounded-lg bg-emma-200/5 border border-emma-200/8 text-[11px] text-emma-200/40 hover:text-emma-200/60 cursor-pointer transition-colors shrink-0"
              >
                {playingVoiceId === sel.voiceId ? "◼ Stop" : "▶ Preview"}
              </button>
            ) : null;
          })()}
        </div>
      )}

      {/* Manual input toggle */}
      <button
        onClick={() => {
          setShowManual((v) => !v);
          setError(null);
        }}
        className="text-[10px] text-emma-200/25 hover:text-emma-200/50 cursor-pointer transition-colors mb-2"
      >
        {showManual ? "← Choose from list" : "Or paste a Voice ID manually"}
      </button>

      {showManual && (
        <div className="mb-2">
          <input
            value={manualVoiceId}
            onChange={(e) => {
              setManualVoiceId(e.target.value);
              setError(null);
            }}
            placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
            className="w-full bg-emma-200/3 border border-emma-200/8 rounded-lg px-3 py-2 text-xs text-emma-100 font-mono placeholder:text-emma-200/15 outline-none focus:border-emma-300/20"
          />
          <p className="text-[10px] text-emma-200/20 mt-1">
            Find this in ElevenLabs → Voices → click a voice → copy ID
          </p>
        </div>
      )}

      {error && <p className="text-[11px] text-red-300/60 mb-2">{error}</p>}
      {success && <p className="text-[11px] text-emerald-300/60 mb-2">{success}</p>}

      <div className="flex items-center gap-3 mt-1">
        <button
          onClick={handleSave}
          disabled={saving || (!selectedVoiceId && !manualVoiceId.trim())}
          className="px-4 py-2 rounded-lg bg-emma-300/15 border border-emma-300/20 text-xs text-emma-300 cursor-pointer disabled:opacity-30 hover:bg-emma-300/20 transition-all"
        >
          {saving ? "…" : "Save Voice"}
        </button>
        <button
          onClick={onSkip}
          className="text-[11px] text-emma-200/25 hover:text-emma-200/50 cursor-pointer transition-colors"
        >
          Use Rachel (default) →
        </button>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    connected: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20",
    disconnected: "bg-emma-200/5 text-emma-200/25 border-emma-200/10",
    auth_expired: "bg-amber-400/10 text-amber-300 border-amber-400/20",
    error: "bg-red-400/10 text-red-300 border-red-400/20",
  };
  const labels: Record<string, string> = {
    connected: "Connected",
    disconnected: "Not connected",
    auth_expired: "Key invalid",
    error: "Error",
  };
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full border ${styles[status] || styles.disconnected}`}
    >
      {labels[status] || status}
    </span>
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return d.toLocaleDateString();
}
