"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Check, AlertTriangle, X, ExternalLink } from "lucide-react";

interface IntegrationStatus {
  status: "connected" | "disconnected" | "auth_expired" | "error";
  accountIdentifier: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
}

const SERVICES = [
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

  const fetchStatuses = async () => {
    try {
      const res = await fetch("/api/integrations/status");
      const data = await res.json();
      setStatuses(data.integrations || {});
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchStatuses(); }, []);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-emma-950 via-emma-900 to-emma-950 font-sans text-emma-100">
      <div className="border-b border-surface-border bg-emma-950/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link href="/settings" className="text-emma-200/30 hover:text-emma-300 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-sm font-semibold text-emma-300 tracking-wider">Integrations</h1>
            <p className="text-[10px] text-emma-200/25">Connect external services to unlock Emma's full capabilities</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center text-sm text-emma-200/20 py-12">Loading integrations…</div>
        ) : (
          <div className="flex flex-col gap-3">
            {SERVICES.map((svc) => {
              const status = statuses[svc.id] || { status: "disconnected", accountIdentifier: null, lastUsedAt: null, lastError: null };
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
                        <p className="text-[11px] font-light text-emma-200/30 mt-0.5">{svc.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isConnected && (
                        <button onClick={() => handleDisconnect(svc.id)}
                          className="text-[11px] text-red-300/40 hover:text-red-300/70 cursor-pointer transition-colors">
                          Disconnect
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Connected details */}
                  {isConnected && (
                    <div className="mt-3 flex items-center gap-4 text-[11px] text-emma-200/25">
                      {status.accountIdentifier && <span>{status.accountIdentifier}</span>}
                      {status.lastUsedAt && <span>Last used {fmtTime(status.lastUsedAt)}</span>}
                    </div>
                  )}

                  {/* Error state */}
                  {isError && status.lastError && (
                    <div className="mt-3 text-[11px] text-red-300/50 bg-red-400/5 rounded-lg px-3 py-2">
                      {status.lastError}
                    </div>
                  )}

                  {/* Connect buttons */}
                  {(!isConnected || isExpired) && (
                    <div className="mt-4">
                      {svc.authType === "oauth" && (
                        <a href={svc.oauthUrl}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emma-300/10 border border-emma-300/15 text-xs text-emma-300 hover:bg-emma-300/15 transition-all">
                          <ExternalLink size={12} />
                          {isExpired ? "Reconnect" : "Connect"} {svc.name}
                        </a>
                      )}

                      {svc.authType === "api_key" && !showHubspotInput && (
                        <button onClick={() => setShowHubspotInput(true)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emma-300/10 border border-emma-300/15 text-xs text-emma-300 hover:bg-emma-300/15 transition-all cursor-pointer">
                          Connect {svc.name}
                        </button>
                      )}

                      {svc.authType === "api_key" && showHubspotInput && (
                        <div className="flex items-center gap-2">
                          <input value={hubspotKey} onChange={(e) => setHubspotKey(e.target.value)}
                            placeholder="Paste your HubSpot API key"
                            className="flex-1 bg-emma-200/3 border border-emma-200/8 rounded-lg px-3 py-2 text-xs text-emma-100 placeholder:text-emma-200/15 outline-none" />
                          <button onClick={handleHubspotSave} disabled={!hubspotKey.trim() || hubspotSaving}
                            className="px-3 py-2 rounded-lg bg-emma-300/15 text-xs text-emma-300 cursor-pointer disabled:opacity-30 transition-opacity">
                            {hubspotSaving ? "…" : "Save"}
                          </button>
                          <button onClick={() => { setShowHubspotInput(false); setHubspotKey(""); }}
                            className="text-emma-200/20 hover:text-emma-200/40 cursor-pointer">
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
    </div>
  );
}

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
    auth_expired: "Reconnect needed",
    error: "Error",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${styles[status] || styles.disconnected}`}>
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
