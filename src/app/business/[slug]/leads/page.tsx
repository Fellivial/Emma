import { requireClientAccess } from "../_lib/auth";

interface Lead {
  id: string;
  name: string;
  contact: string;
  notes: string | null;
  created_at: string;
}

export default async function BusinessLeadsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { client, supabase } = await requireClientAccess(slug);

  const { data: leads } = await supabase
    .from("leads")
    .select("id, name, contact, notes, created_at")
    .eq("client_slug", slug)
    .order("created_at", { ascending: false })
    .limit(500);

  const rows: Lead[] = leads ?? [];

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-sm font-medium text-emma-200/60">Leads</h1>
          <p className="text-[11px] text-emma-200/25 mt-0.5">
            {rows.length} lead{rows.length !== 1 ? "s" : ""} · {client.name}
          </p>
        </div>
      </div>

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
  );
}
