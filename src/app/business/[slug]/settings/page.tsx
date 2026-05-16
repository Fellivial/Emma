"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Save } from "lucide-react";

export default function SettingsPage() {
  const { slug } = useParams<{ slug: string }>();
  const [ownerEmail, setOwnerEmail] = useState("");
  const [sheetsId, setSheetsId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/business/${slug}/settings`)
      .then((r) => r.json())
      .then((d) => {
        setOwnerEmail(d.ownerEmail ?? "");
        setSheetsId(d.sheetsId ?? "");
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [slug]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/business/${slug}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerEmail, sheetsId }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Save failed");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h2 className="text-sm font-medium text-emma-200/50 uppercase tracking-widest mb-8">
        Intake Settings
      </h2>

      {loading ? (
        <div className="text-sm text-emma-200/20 py-8">Loading…</div>
      ) : (
        <div className="space-y-6">
          <SettingField
            label="Notification Email"
            hint="Lead capture notifications are sent to this address."
            value={ownerEmail}
            onChange={setOwnerEmail}
            type="email"
            placeholder="owner@yourbusiness.com"
          />
          <SettingField
            label="Google Sheets ID"
            hint="Leads are appended to Sheet1!A:D of this spreadsheet. Find the ID in the sheet URL between /d/ and /edit."
            value={sheetsId}
            onChange={setSheetsId}
            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
          />

          {error && <p className="text-xs text-red-400/60">{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emma-300/10 text-emma-300/70 text-xs hover:bg-emma-300/20 disabled:opacity-40 transition-colors"
          >
            <Save size={12} />
            {saving ? "Saving…" : saved ? "Saved!" : "Save Settings"}
          </button>
        </div>
      )}
    </div>
  );
}

function SettingField({
  label,
  hint,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-emma-200/50 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-emma-950 border border-surface-border rounded-lg px-3 py-2 text-sm text-emma-200/70 placeholder-emma-200/20 focus:outline-none focus:border-emma-300/30 transition-colors"
      />
      <p className="text-[11px] text-emma-200/25 mt-1">{hint}</p>
    </div>
  );
}
