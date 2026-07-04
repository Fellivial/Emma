import Link from "next/link";

const MORE_SECTIONS = [
  {
    label: "Companion",
    items: [
      {
        href: "/settings/persona",
        label: "Persona",
        desc: "Shape how Emma talks and carries herself",
      },
      {
        href: "/settings/documents",
        label: "Documents",
        desc: "Files Emma has read and remembers",
      },
      {
        href: "/settings/notifications",
        label: "Notifications",
        desc: "When and how Emma reaches out",
      },
    ],
  },
  {
    label: "Advanced",
    items: [
      {
        href: "/settings/integrations",
        label: "Integrations",
        desc: "Connect the services Emma can help you with",
      },
      {
        href: "/settings/tasks",
        label: "Tasks",
        desc: "Things Emma is working on for you",
      },
      {
        href: "/settings/provenance",
        label: "Audit Trail",
        desc: "Review memory and action history",
      },
    ],
  },
];

export default function MoreSettingsPage() {
  return (
    <div className="p-6 max-w-lg mx-auto">
      {MORE_SECTIONS.map((section, sectionIdx) => (
        <div key={section.label} className={sectionIdx > 0 ? "mt-8" : ""}>
          <h2 className="text-xs font-medium text-emma-200/30 uppercase tracking-widest mb-4">
            {section.label}
          </h2>
          <div className="flex flex-col gap-2">
            {section.items.map((item) => (
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
      ))}
    </div>
  );
}
