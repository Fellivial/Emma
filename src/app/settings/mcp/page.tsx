"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { X } from "lucide-react";

interface McpServer {
  id: string;
  service: string;
  mcp_url: string | null;
  status: string;
  created_at: string;
}

const KNOWN_SERVERS = [
  { name: "Notion", url: "https://mcp.notion.com/mcp", icon: "📝" },
  { name: "Google Calendar", url: "https://calendarmcp.googleapis.com/mcp/v1", icon: "📅" },
  { name: "Gmail", url: "https://gmailmcp.googleapis.com/mcp/v1", icon: "📧" },
  { name: "Slack", url: "https://mcp.slack.com/mcp", icon: "💬" },
  { name: "Supabase", url: "https://mcp.supabase.com/mcp", icon: "🗄️" },
  { name: "GitHub", url: "https://mcp.github.com/mcp", icon: "🐙" },
];

export default function McpPage() {
  const supabase = useMemo(() => createClient(), []);
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formToken, setFormToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const fetchServers = useCallback(async () => {
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!client) {
      setLoading(false);
      return;
    }
    setClientId(client.id);

    const { data } = await supabase
      .from("client_integrations")
      .select("id, service, mcp_url, status, created_at")
      .eq("client_id", client.id)
      .like("service", "mcp_%")
      .eq("status", "connected")
      .order("created_at", { ascending: false });

    setServers(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const handleDisconnect = async (serverId: string) => {
    if (!supabase) return;
    await supabase
      .from("client_integrations")
      .update({ status: "disconnected" })
      .eq("id", serverId);
    fetchServers();
  };

  const handleConnect = async () => {
    setFormError(null);
    setFormSuccess(null);

    if (!formName.trim()) {
      setFormError("Server name is required.");
      return;
    }
    const trimmedUrl = formUrl.trim();
    if (!trimmedUrl.startsWith("https://")) {
      setFormError("URL must start with https://");
      return;
    }
    // Block private/link-local targets (SSRF guard)
    try {
      const { hostname } = new URL(trimmedUrl);
      const blocked =
        hostname === "localhost" ||
        hostname === "0.0.0.0" ||
        /^127\./.test(hostname) ||
        /^10\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
        /^169\.254\./.test(hostname) ||
        hostname.endsWith(".local") ||
        hostname.endsWith(".internal");
      if (blocked) {
        setFormError("Private or internal addresses are not allowed.");
        return;
      }
    } catch {
      setFormError("Invalid URL.");
      return;
    }
    if (!clientId || !supabase) {
      setFormError("Not authenticated.");
      return;
    }

    setConnecting(true);

    const service = `mcp_${formName.trim().toLowerCase().replace(/\s+/g, "_")}`;

    let access_token: string | null = null;
    if (formToken.trim()) {
      const res = await fetch("/api/integrations/mcp/encrypt-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: formToken.trim() }),
      });
      if (!res.ok) {
        setFormError("Failed to encrypt token. Please try again.");
        setConnecting(false);
        return;
      }
      const d = await res.json();
      access_token = d.encrypted ?? null;
    }

    const row: Record<string, unknown> = {
      client_id: clientId,
      service,
      mcp_url: trimmedUrl,
      status: "connected",
    };
    if (access_token) row.access_token = access_token;

    const { error } = await supabase.from("client_integrations").upsert(row, {
      onConflict: "client_id,service",
    });

    if (error) {
      setFormError("Failed to connect. Please try again.");
    } else {
      setFormSuccess(`${formName.trim()} connected successfully.`);
      setFormName("");
      setFormUrl("");
      setFormToken("");
      fetchServers();
    }
    setConnecting(false);
  };

  const prefillForm = (name: string, url: string) => {
    setFormName(name);
    setFormUrl(url);
    setFormToken("");
    setFormError(null);
    setFormSuccess(null);
    document.getElementById("mcp-form")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-light text-emma-100">MCP Servers</h1>
        <p className="text-xs text-emma-300/50 mt-1">
          Connect Model Context Protocol servers to extend Emma's tool access.
        </p>
      </div>

      {/* ── Connected servers ──────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-[10px] font-medium text-emma-200/20 uppercase tracking-[0.2em] mb-3">
          Connected
        </h2>
        {loading ? (
          <div className="text-center text-sm text-emma-200/20 py-8">Loading…</div>
        ) : servers.length === 0 ? (
          <div className="rounded-xl border border-surface-border bg-surface p-6 text-center">
            <p className="text-sm text-emma-200/20">No MCP servers connected yet.</p>
            <p className="text-[11px] text-emma-200/15 mt-1">
              Add one below or pick from the discovery list.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {servers.map((s) => (
              <div key={s.id} className="rounded-xl border border-surface-border bg-surface p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emma-300/10 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-mono text-emma-300/60">MCP</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-emma-200/70">
                          {s.service.replace(/^mcp_/, "").replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
                          Connected
                        </span>
                      </div>
                      <p className="text-[11px] font-light text-emma-200/25 mt-0.5 font-mono">
                        {s.mcp_url}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[10px] text-emma-200/15">{fmtTime(s.created_at)}</span>
                    <button
                      onClick={() => handleDisconnect(s.id)}
                      className="text-[11px] text-red-300/40 hover:text-red-300/70 cursor-pointer transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Add new server ────────────────────────────────────────── */}
      <section className="mb-8" id="mcp-form">
        <h2 className="text-[10px] font-medium text-emma-200/20 uppercase tracking-[0.2em] mb-3">
          Add New Server
        </h2>
        <div className="rounded-xl border border-surface-border bg-surface p-5">
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-[10px] text-emma-200/30 block mb-1.5">Server name</label>
              <input
                value={formName}
                onChange={(e) => {
                  setFormName(e.target.value);
                  setFormError(null);
                }}
                placeholder="e.g. My Notion"
                className="w-full bg-emma-200/3 border border-emma-200/8 rounded-lg px-3 py-2 text-xs text-emma-100 placeholder:text-emma-200/15 outline-none focus:border-emma-300/20 transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] text-emma-200/30 block mb-1.5">Server URL</label>
              <input
                value={formUrl}
                onChange={(e) => {
                  setFormUrl(e.target.value);
                  setFormError(null);
                }}
                placeholder="https://mcp.example.com/mcp"
                className="w-full bg-emma-200/3 border border-emma-200/8 rounded-lg px-3 py-2 text-xs text-emma-100 font-mono placeholder:text-emma-200/15 outline-none focus:border-emma-300/20 transition-colors"
              />
              <p className="text-[10px] text-emma-200/15 mt-1">Must start with https://</p>
            </div>
            <div>
              <label className="text-[10px] text-emma-200/30 block mb-1.5">
                Auth token <span className="text-emma-200/15">(optional)</span>
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={formToken}
                  onChange={(e) => setFormToken(e.target.value)}
                  placeholder="Bearer token or API key"
                  className="w-full bg-emma-200/3 border border-emma-200/8 rounded-lg px-3 py-2 text-xs text-emma-100 placeholder:text-emma-200/15 outline-none focus:border-emma-300/20 transition-colors pr-8"
                />
                {formToken && (
                  <button
                    onClick={() => setFormToken("")}
                    className="absolute right-2 top-2 text-emma-200/20 hover:text-emma-200/40 cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <p className="text-[10px] text-emma-200/15 mt-1">Encrypted at rest with AES-256.</p>
            </div>
          </div>

          {formError && <p className="text-[11px] text-red-300/60 mt-3">{formError}</p>}
          {formSuccess && <p className="text-[11px] text-emerald-300/60 mt-3">{formSuccess}</p>}

          <button
            onClick={handleConnect}
            disabled={connecting || !formName.trim() || !formUrl.trim()}
            className="mt-4 px-5 py-2 rounded-lg bg-emma-300/15 border border-emma-300/20 text-xs text-emma-300 cursor-pointer disabled:opacity-30 hover:bg-emma-300/20 transition-all"
          >
            {connecting ? "Connecting…" : "Connect →"}
          </button>
        </div>
      </section>

      {/* ── Discovery list ────────────────────────────────────────── */}
      <section>
        <h2 className="text-[10px] font-medium text-emma-200/20 uppercase tracking-[0.2em] mb-3">
          Available Servers
        </h2>
        <div className="flex flex-col gap-2">
          {KNOWN_SERVERS.map((s) => {
            const alreadyConnected = servers.some((srv) => srv.mcp_url === s.url);
            return (
              <div
                key={s.url}
                className="rounded-xl border border-surface-border bg-surface p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{s.icon}</span>
                  <div>
                    <div className="text-sm font-medium text-emma-200/60">{s.name}</div>
                    <p className="text-[11px] font-mono text-emma-200/20">{s.url}</p>
                  </div>
                </div>
                {alreadyConnected ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 text-emerald-300 shrink-0">
                    Connected
                  </span>
                ) : (
                  <button
                    onClick={() => prefillForm(s.name, s.url)}
                    className="text-[11px] px-3 py-1.5 rounded-lg bg-emma-300/10 border border-emma-300/15 text-emma-300 hover:bg-emma-300/15 cursor-pointer transition-all shrink-0"
                  >
                    Add →
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
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
