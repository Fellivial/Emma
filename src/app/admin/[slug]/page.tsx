import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { getUser } from "@/lib/supabase/server";

interface Lead {
  id: string;
  name: string;
  contact: string;
  notes: string | null;
  created_at: string;
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export default async function ClientLeadsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const user = await getUser();
  if (!user) redirect("/login");

  const supabase = getServiceSupabase();
  if (!supabase) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-emma-950 font-sans">
        <p className="text-sm text-red-300/60">Database not configured.</p>
      </div>
    );
  }

  // Verify this user is a member of the client with this slug
  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("slug", slug)
    .single();

  if (!client) redirect("/app");

  const { data: membership } = await supabase
    .from("client_members")
    .select("user_id")
    .eq("client_id", client.id)
    .eq("user_id", user.id)
    .single();

  if (!membership) redirect("/app");

  const { data: leads } = await supabase
    .from("leads")
    .select("id, name, contact, notes, created_at")
    .eq("client_slug", slug)
    .order("created_at", { ascending: false })
    .limit(500);

  const rows: Lead[] = leads ?? [];

  return (
    <div className="min-h-screen bg-emma-950 font-sans text-emma-100">
      {/* Header */}
      <div className="border-b border-surface-border bg-emma-950/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-emma-200/70">Leads</h1>
            <p className="text-[10px] text-emma-200/25">
              {client.name} · {slug}
            </p>
          </div>
          <span className="text-xs text-emma-200/25">
            {rows.length} lead{rows.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-surface-border bg-surface p-12 text-center">
            <p className="text-sm text-emma-200/25">No leads yet.</p>
            <p className="text-xs text-emma-200/15 mt-1">
              Leads will appear here once visitors complete your intake flow.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-surface-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-border bg-surface">
                  <th className="text-left px-4 py-3 font-medium text-emma-200/30">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-emma-200/30">Contact</th>
                  <th className="text-left px-4 py-3 font-medium text-emma-200/30">Notes</th>
                  <th className="text-right px-4 py-3 font-medium text-emma-200/30">Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((lead) => (
                  <tr
                    key={lead.id}
                    className="border-b border-surface-border/50 hover:bg-surface/50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-emma-200/60">{lead.name}</td>
                    <td className="px-4 py-3 text-emma-200/50">{lead.contact}</td>
                    <td className="px-4 py-3 text-emma-200/30 max-w-xs truncate">
                      {lead.notes ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-emma-200/25 whitespace-nowrap">
                      {new Date(lead.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-center text-[10px] text-emma-200/10 mt-6">
          Leads older than 90 days are automatically deleted per our data retention policy.
        </p>
      </div>
    </div>
  );
}
