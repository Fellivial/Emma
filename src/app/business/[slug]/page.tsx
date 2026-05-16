import Link from "next/link";
import { requireClientAccess } from "./_lib/auth";

interface RecentLead {
  id: string;
  name: string;
  contact: string;
  created_at: string;
}

export default async function BusinessOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { supabase } = await requireClientAccess(slug);

  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [totalRes, todayRes, weekRes, recentRes] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("client_slug", slug),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("client_slug", slug)
      .gte("created_at", `${today}T00:00:00.000Z`),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("client_slug", slug)
      .gte("created_at", weekAgo),
    supabase
      .from("leads")
      .select("id, name, contact, created_at")
      .eq("client_slug", slug)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const total = totalRes.count ?? 0;
  const todayCount = todayRes.count ?? 0;
  const weekCount = weekRes.count ?? 0;
  const recent: RecentLead[] = recentRes.data ?? [];

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatCard label="Total Leads" value={total} />
        <StatCard label="Today" value={todayCount} />
        <StatCard label="This Week" value={weekCount} />
      </div>

      {/* Recent leads */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-medium text-emma-200/30 uppercase tracking-widest">Recent</h2>
          <Link
            href={`/business/${slug}/leads`}
            className="text-[11px] text-emma-200/25 hover:text-emma-200/50 transition-colors"
          >
            View all →
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="rounded-xl border border-surface-border bg-surface p-8 text-center">
            <p className="text-sm text-emma-200/25">No leads yet.</p>
            <p className="text-xs text-emma-200/15 mt-1">
              Share your intake link to start collecting leads.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-surface-border overflow-hidden">
            {recent.map((lead, i) => (
              <div
                key={lead.id}
                className={`flex items-center justify-between px-4 py-3 ${
                  i < recent.length - 1 ? "border-b border-surface-border/50" : ""
                } hover:bg-surface/50 transition-colors`}
              >
                <div>
                  <p className="text-xs font-medium text-emma-200/60">{lead.name}</p>
                  <p className="text-[11px] text-emma-200/30">{lead.contact}</p>
                </div>
                <span className="text-[11px] text-emma-200/20">
                  {new Date(lead.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Intake link card */}
      <div className="rounded-xl border border-surface-border bg-surface p-5">
        <p className="text-xs font-medium text-emma-200/30 uppercase tracking-widest mb-2">
          Intake URL
        </p>
        <div className="flex items-center gap-3">
          <code className="flex-1 text-[11px] text-emma-200/40 bg-emma-950/60 rounded-md px-3 py-2 truncate">
            /intake/{slug}
          </code>
          <a
            href={`/intake/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-emma-200/30 hover:text-emma-200/60 border border-surface-border rounded-md px-3 py-2 transition-colors whitespace-nowrap"
          >
            Open ↗
          </a>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface px-5 py-4">
      <div className="text-2xl font-light text-emma-200/60 mb-1">{value}</div>
      <div className="text-[11px] text-emma-200/25">{label}</div>
    </div>
  );
}
