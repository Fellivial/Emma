"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, ChevronDown, ExternalLink, Zap } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

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

type ELSetupStep = "idle" | "select_voice" | "connected";

interface ConnectorTool {
  name: string;
  label: string;
  permission: "read" | "write";
}

interface Connector {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: "voice" | "productivity" | "communication" | "crm";
  authType: "oauth" | "api_key";
  initials: string;
  iconGradient: string;
  tools: ConnectorTool[];
  scopes?: string[];
}

// ─── Registry ────────────────────────────────────────────────────────────────

const CONNECTORS: Connector[] = [
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    tagline: "Neural text-to-speech with 900+ voices",
    description:
      "Upgrade Emma's voice from browser Web Speech to neural TTS. Connect your ElevenLabs API key (any plan) and choose from hundreds of voices — including cloned voices from your account.",
    category: "voice",
    authType: "api_key",
    initials: "EL",
    iconGradient: "from-violet-500 to-purple-700",
    tools: [{ name: "speak_text", label: "Synthesize speech from text", permission: "write" }],
  },
  {
    id: "gmail",
    name: "Gmail",
    tagline: "Send emails on your behalf",
    description:
      "Let Emma send emails through your Gmail account. Useful for follow-ups, scheduling, and outreach — Emma composes and sends with your signature.",
    category: "productivity",
    authType: "oauth",
    initials: "G",
    iconGradient: "from-red-400 to-rose-600",
    tools: [{ name: "send_email", label: "Send email from your account", permission: "write" }],
    scopes: ["Send email on your behalf (gmail.send)"],
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    tagline: "Book appointments and manage events",
    description:
      "Emma can create calendar events, schedule meetings, and book appointments directly in your Google Calendar.",
    category: "productivity",
    authType: "oauth",
    initials: "GC",
    iconGradient: "from-blue-400 to-blue-600",
    tools: [{ name: "create_event", label: "Create calendar events", permission: "write" }],
    scopes: ["Create and edit calendar events (calendar.events)"],
  },
  {
    id: "google_drive",
    name: "Google Drive",
    tagline: "Access and organize your files",
    description:
      "Emma can upload documents, list files in your Drive, and retrieve file contents — useful for knowledge management and document workflows.",
    category: "productivity",
    authType: "oauth",
    initials: "GD",
    iconGradient: "from-emerald-400 to-teal-600",
    tools: [
      { name: "upload_file", label: "Upload files to Drive", permission: "write" },
      { name: "list_files", label: "List files and folders", permission: "read" },
      { name: "read_file", label: "Read file contents", permission: "read" },
    ],
    scopes: ["See, edit, and create specific files you open with Emma (drive.file)"],
  },
  {
    id: "notion",
    name: "Notion",
    tagline: "Create pages and search your workspace",
    description:
      "Emma can create new pages, update existing ones, and search your Notion workspace — turning conversations into documentation.",
    category: "productivity",
    authType: "oauth",
    initials: "N",
    iconGradient: "from-stone-400 to-zinc-600",
    tools: [
      { name: "create_page", label: "Create pages in your workspace", permission: "write" },
      { name: "update_page", label: "Update existing pages", permission: "write" },
      { name: "search_pages", label: "Search across your workspace", permission: "read" },
    ],
    scopes: ["Read and write pages in workspaces you choose"],
  },
  {
    id: "slack",
    name: "Slack",
    tagline: "Send messages and post to channels",
    description:
      "Emma can send messages to channels, post files, and read channel history — making it easy to share updates directly to your team.",
    category: "communication",
    authType: "oauth",
    initials: "S",
    iconGradient: "from-fuchsia-400 to-pink-600",
    tools: [
      { name: "send_message", label: "Send messages to channels", permission: "write" },
      { name: "upload_file", label: "Share files in channels", permission: "write" },
      { name: "list_channels", label: "List available channels", permission: "read" },
    ],
    scopes: [
      "Read channel list (channels:read)",
      "Send messages (chat:write)",
      "Upload files (files:write)",
    ],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    tagline: "Log contacts and track your pipeline",
    description:
      "Emma can create contacts, log calls, and update deals in your HubSpot CRM. Connect with a private app token from your HubSpot portal.",
    category: "crm",
    authType: "api_key",
    initials: "HS",
    iconGradient: "from-orange-400 to-amber-600",
    tools: [
      { name: "create_contact", label: "Create and update contacts", permission: "write" },
      { name: "create_deal", label: "Create and update deals", permission: "write" },
      { name: "log_note", label: "Log notes and activities", permission: "write" },
    ],
  },
];

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "voice", label: "Voice" },
  { id: "productivity", label: "Productivity" },
  { id: "communication", label: "Communication" },
  { id: "crm", label: "CRM" },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const [statuses, setStatuses] = useState<Record<string, IntegrationStatus>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    if (connected) {
      setSelectedId(connected);
      window.history.replaceState({}, "", "/settings/integrations");
    }
  }, [fetchStatuses]);

  const handleDisconnect = async (service: string) => {
    await fetch("/api/integrations/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service }),
    });
    fetchStatuses();
  };

  const filtered = CONNECTORS.filter((c) => {
    if (category !== "all" && c.category !== category) return false;
    if (
      search &&
      !c.name.toLowerCase().includes(search.toLowerCase()) &&
      !c.tagline.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  const selected = CONNECTORS.find((c) => c.id === selectedId) ?? null;

  const getStatus = (id: string): IntegrationStatus =>
    statuses[id] ?? {
      status: "disconnected",
      accountIdentifier: null,
      lastUsedAt: null,
      lastError: null,
    };

  return (
    <div className="max-w-4xl mx-auto px-8 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-light text-emma-100">Integrations</h1>
        <p className="text-xs text-emma-300/50 mt-1">
          Connect external services to extend Emma's capabilities.
        </p>
      </div>

      {/* Search + Category filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative max-w-xs flex-1">
          <Search
            size={13}
            className="absolute left-3 top-2.5 text-emma-200/20 pointer-events-none"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search integrations…"
            className="w-full pl-8 pr-3 py-2 bg-emma-200/3 border border-emma-200/8 rounded-lg text-xs text-emma-100 placeholder:text-emma-200/15 outline-none focus:border-emma-200/15"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                category === cat.id
                  ? "bg-emma-300/15 border border-emma-300/20 text-emma-300"
                  : "bg-emma-200/3 border border-emma-200/8 text-emma-200/40 hover:text-emma-200/60"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-sm text-emma-200/20 py-12">Loading…</div>
      ) : (
        <>
          {/* Card grid */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            {filtered.map((connector) => (
              <ConnectorCard
                key={connector.id}
                connector={connector}
                status={getStatus(connector.id)}
                isSelected={selectedId === connector.id}
                onClick={() =>
                  setSelectedId(selectedId === connector.id ? null : connector.id)
                }
              />
            ))}
            {filtered.length === 0 && (
              <div className="col-span-2 text-center text-xs text-emma-200/20 py-8">
                No integrations match your search.
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <ConnectorDetail
              connector={selected}
              status={getStatus(selected.id)}
              onConnected={fetchStatuses}
              onDisconnect={handleDisconnect}
              onClose={() => setSelectedId(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

// ─── Connector Card ───────────────────────────────────────────────────────────

function ConnectorCard({
  connector,
  status,
  isSelected,
  onClick,
}: {
  connector: Connector;
  status: IntegrationStatus;
  isSelected: boolean;
  onClick: () => void;
}) {
  const isConnected = status.status === "connected";

  return (
    <button
      onClick={onClick}
      className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
        isSelected
          ? "border-emma-300/30 bg-emma-300/5"
          : "border-surface-border bg-surface hover:border-emma-200/15 hover:bg-emma-200/3"
      }`}
    >
      <div className="flex items-start gap-3">
        <ConnectorIcon initials={connector.initials} gradient={connector.iconGradient} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-emma-200/80">{connector.name}</span>
            {isConnected && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            )}
          </div>
          <p className="text-[11px] text-emma-200/30 leading-relaxed line-clamp-2">
            {connector.tagline}
          </p>
        </div>
      </div>
    </button>
  );
}

// ─── Connector Detail Panel ───────────────────────────────────────────────────

function ConnectorDetail({
  connector,
  status,
  onConnected,
  onDisconnect,
  onClose,
}: {
  connector: Connector;
  status: IntegrationStatus;
  onConnected: () => void;
  onDisconnect: (id: string) => void;
  onClose: () => void;
}) {
  const [hubspotKey, setHubspotKey] = useState("");
  const [hubspotSaving, setHubspotSaving] = useState(false);

  const isConnected = status.status === "connected";
  const isExpired = status.status === "auth_expired";
  const isError = status.status === "error";

  const handleHubspotSave = async () => {
    if (!hubspotKey.trim()) return;
    setHubspotSaving(true);
    await fetch("/api/integrations/hubspot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: hubspotKey.trim() }),
    });
    setHubspotKey("");
    setHubspotSaving(false);
    onConnected();
  };

  const oauthLabel = connector.id.startsWith("google") ? "Google" : connector.name;

  return (
    <div className="rounded-xl border border-emma-300/15 bg-emma-300/3 p-6 mt-1">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-4">
          <ConnectorIcon
            initials={connector.initials}
            gradient={connector.iconGradient}
            size="lg"
          />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-medium text-emma-100">{connector.name}</h2>
              <StatusBadge status={status.status} />
            </div>
            {isConnected && status.accountIdentifier && (
              <p className="text-[11px] text-emma-200/35 mt-0.5">{status.accountIdentifier}</p>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-emma-200/20 hover:text-emma-200/50 cursor-pointer transition-colors mt-1"
        >
          <X size={15} />
        </button>
      </div>

      {/* Description */}
      <p className="text-xs text-emma-200/50 leading-relaxed mb-5">{connector.description}</p>

      {/* Tools */}
      <div className="mb-5">
        <p className="text-[10px] font-medium text-emma-200/25 uppercase tracking-wider mb-2">
          Available tools
        </p>
        <div className="flex flex-col gap-1">
          {connector.tools.map((tool) => (
            <div
              key={tool.name}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-emma-200/3 border border-emma-200/5"
            >
              <div className="flex items-center gap-2">
                <Zap size={11} className="text-emma-300/40 shrink-0" />
                <span className="text-[11px] font-mono text-emma-300/60">{tool.name}</span>
                <span className="text-[11px] text-emma-200/30">{tool.label}</span>
              </div>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded border ${
                  tool.permission === "read"
                    ? "border-blue-400/20 text-blue-300/50"
                    : "border-amber-400/20 text-amber-300/50"
                }`}
              >
                {tool.permission}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Scopes */}
      {connector.scopes && connector.scopes.length > 0 && (
        <div className="mb-5">
          <p className="text-[10px] font-medium text-emma-200/25 uppercase tracking-wider mb-2">
            Permissions requested
          </p>
          <ul className="flex flex-col gap-1">
            {connector.scopes.map((scope) => (
              <li key={scope} className="text-[11px] text-emma-200/35 flex items-start gap-1.5">
                <span className="text-emma-200/20 mt-0.5">•</span>
                {scope}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Error */}
      {isError && status.lastError && (
        <div className="mb-4 text-[11px] text-red-300/50 bg-red-400/5 rounded-lg px-3 py-2">
          {status.lastError}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4 border-t border-surface-border">
        {/* ElevenLabs BYOK */}
        {connector.id === "elevenlabs" && (
          <ElevenLabsConnect
            status={status}
            onConnected={onConnected}
            onDisconnect={() => onDisconnect("elevenlabs")}
          />
        )}

        {/* OAuth connectors */}
        {connector.authType === "oauth" && (
          <>
            {(!isConnected || isExpired) && (
              <a
                href={`/api/integrations/${connector.id}/oauth/start`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emma-300/10 border border-emma-300/15 text-xs text-emma-300 hover:bg-emma-300/15 transition-all"
              >
                <ExternalLink size={12} />
                {isExpired ? "Reconnect" : "Connect"} with {oauthLabel}
              </a>
            )}
            {isConnected && (
              <>
                {status.lastUsedAt && (
                  <span className="text-[11px] text-emma-200/20">
                    Last used {fmtTime(status.lastUsedAt)}
                  </span>
                )}
                <button
                  onClick={() => onDisconnect(connector.id)}
                  className="ml-auto text-[11px] text-red-300/40 hover:text-red-300/70 cursor-pointer transition-colors"
                >
                  Disconnect
                </button>
              </>
            )}
          </>
        )}

        {/* HubSpot API key */}
        {connector.authType === "api_key" && connector.id === "hubspot" && (
          <div className="flex-1">
            {isConnected ? (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-emma-200/30">
                  {status.accountIdentifier || "Connected"}
                  {status.lastUsedAt && ` · Last used ${fmtTime(status.lastUsedAt)}`}
                </span>
                <button
                  onClick={() => onDisconnect("hubspot")}
                  className="text-[11px] text-red-300/40 hover:text-red-300/70 cursor-pointer transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  value={hubspotKey}
                  onChange={(e) => setHubspotKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleHubspotSave()}
                  placeholder="Paste your HubSpot private app token"
                  className="flex-1 bg-emma-200/3 border border-emma-200/8 rounded-lg px-3 py-2 text-xs text-emma-100 placeholder:text-emma-200/15 outline-none focus:border-emma-200/15"
                />
                <button
                  onClick={handleHubspotSave}
                  disabled={!hubspotKey.trim() || hubspotSaving}
                  className="px-3 py-2 rounded-lg bg-emma-300/15 text-xs text-emma-300 cursor-pointer disabled:opacity-30 transition-opacity"
                >
                  {hubspotSaving ? "…" : "Save"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ConnectorIcon ────────────────────────────────────────────────────────────

function ConnectorIcon({
  initials,
  gradient,
  size,
}: {
  initials: string;
  gradient: string;
  size: "sm" | "lg";
}) {
  const cls = size === "lg" ? "w-12 h-12 text-sm" : "w-9 h-9 text-[11px]";
  return (
    <div
      className={`${cls} rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center font-semibold text-white shrink-0`}
    >
      {initials}
    </div>
  );
}

// ─── ElevenLabs Connect ───────────────────────────────────────────────────────

function ElevenLabsConnect({
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
    <div className="flex-1">
      {/* idle / expired: API key input */}
      {(step === "idle" || isExpired) && (
        <div>
          {isExpired && (
            <p className="text-[11px] text-amber-300/60 mb-3">
              Your key was rejected. Generate a new one at elevenlabs.io
            </p>
          )}
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
            Get your key at{" "}
            <a
              href="https://elevenlabs.io/app/settings/api-keys"
              target="_blank"
              rel="noreferrer"
              className="text-emma-300/40 hover:text-emma-300 underline"
            >
              elevenlabs.io → Profile → API Keys
            </a>
          </p>
        </div>
      )}

      {/* select_voice: after key saved */}
      {step === "select_voice" && (
        <div>
          <p className="text-[11px] text-emerald-300/70 mb-3">
            Connected! Choose Emma's voice, or skip to use Rachel (default).
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

      {/* connected */}
      {step === "connected" && (
        <div className="flex-1 w-full">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-[11px] text-emma-200/30">
              <span>🎙️ {status.voiceName || "Rachel (default)"}</span>
              {status.lastUsedAt && <span>Last used {fmtTime(status.lastUsedAt)}</span>}
            </div>
            <div className="flex items-center gap-4">
              {!showVoiceSelector && (
                <button
                  onClick={() => setShowVoiceSelector(true)}
                  className="text-[11px] text-emma-300/50 hover:text-emma-300 cursor-pointer transition-colors"
                >
                  Change voice →
                </button>
              )}
              <button
                onClick={onDisconnect}
                className="text-[11px] text-red-300/40 hover:text-red-300/70 cursor-pointer transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
          {showVoiceSelector && (
            <div className="mt-3 pt-3 border-t border-surface-border">
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

// ─── Voice Selector ───────────────────────────────────────────────────────────

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
          if (!selectedVoiceId && d.voices.length > 0) setSelectedVoiceId(d.voices[0].voiceId);
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
      setTimeout(() => onSaved(data.voiceName), 1200);
    } catch {
      setError("Failed to save voice");
    }
    setSaving(false);
  };

  const userVoices = voices.filter((v) => v.category === "cloned" || v.category === "generated");
  const premadeVoices = voices.filter(
    (v) => v.category !== "cloned" && v.category !== "generated"
  );

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}
