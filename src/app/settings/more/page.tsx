import Link from "next/link";

const MORE_ITEMS = [
  {
    href: "/settings/workflows",
    label: "Workflows",
    desc: "Manage automated routines and triggers",
  },
  {
    href: "/settings/mcp",
    label: "MCP Servers",
    desc: "Configure model context protocol servers",
  },
  {
    href: "/settings/provenance",
    label: "Audit Trail",
    desc: "Review memory and action history",
  },
];

export default function MoreSettingsPage() {
  return (
    <div className="p-6 max-w-lg mx-auto">
      <h2 className="text-xs font-medium text-emma-200/30 uppercase tracking-widest mb-4">
        More Settings
      </h2>
      <div className="flex flex-col gap-2">
        {MORE_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center justify-between px-4 py-3.5 rounded-xl border border-surface-border bg-surface hover:bg-surface-hover transition-all group"
          >
            <div>
              <p className="text-sm font-light text-emma-200/80 group-hover:text-emma-200">
                {item.label}
              </p>
              <p className="text-xs font-light text-emma-200/30 mt-0.5">{item.desc}</p>
            </div>
            <span className="text-emma-200/20 group-hover:text-emma-200/40 text-sm transition-colors">
              →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
