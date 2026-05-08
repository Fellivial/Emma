"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const NAV_ITEMS = [
  {
    id: "profile",
    label: "Profile",
    href: "/settings",
    exact: true,
    icon: (active: boolean) => (
      <span
        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? "border-emma-300" : "border-emma-200/25"}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emma-300" : "bg-emma-200/20"}`} />
      </span>
    ),
  },
  {
    id: "usage",
    label: "Usage",
    href: "/settings/usage",
    icon: (active: boolean) => (
      <span
        className={`w-3.5 h-3.5 rotate-45 border-2 shrink-0 ${active ? "border-emma-300 bg-emma-300/10" : "border-emma-200/25"}`}
      />
    ),
  },
  {
    id: "billing",
    label: "Billing",
    href: "/settings/billing",
    icon: (active: boolean) => (
      <span
        className={`w-3.5 h-3.5 rotate-45 border shrink-0 ${active ? "border-emma-300" : "border-emma-200/20"}`}
      />
    ),
  },
  {
    id: "integrations",
    label: "Integrations",
    href: "/settings/integrations",
    icon: (active: boolean) => (
      <span
        className={`w-4 h-4 rounded-full border-2 relative flex items-center justify-center shrink-0 ${active ? "border-emma-300" : "border-emma-200/25"}`}
      >
        <span
          className={`w-2 h-2 rounded-full border ${active ? "border-emma-300/60" : "border-emma-200/15"}`}
        />
      </span>
    ),
  },
  {
    id: "tasks",
    label: "Tasks",
    href: "/settings/tasks",
    icon: (active: boolean) => (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
        <circle
          cx="8"
          cy="8"
          r="2.5"
          stroke={active ? "#e8a0bf" : "rgba(232,160,191,0.25)"}
          strokeWidth="1.5"
        />
        <path
          d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.2 3.2l1.06 1.06M11.74 11.74l1.06 1.06M3.2 12.8l1.06-1.06M11.74 4.26l1.06-1.06"
          stroke={active ? "#e8a0bf" : "rgba(232,160,191,0.25)"}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: "workflows",
    label: "Workflows",
    href: "/settings/workflows",
    icon: (active: boolean) => (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
        <rect
          x="1.5"
          y="1.5"
          width="5"
          height="5"
          rx="1"
          stroke={active ? "#e8a0bf" : "rgba(232,160,191,0.25)"}
          strokeWidth="1.5"
        />
        <rect
          x="9.5"
          y="1.5"
          width="5"
          height="5"
          rx="1"
          stroke={active ? "#e8a0bf" : "rgba(232,160,191,0.25)"}
          strokeWidth="1.5"
        />
        <rect
          x="1.5"
          y="9.5"
          width="5"
          height="5"
          rx="1"
          stroke={active ? "#e8a0bf" : "rgba(232,160,191,0.25)"}
          strokeWidth="1.5"
        />
        <rect
          x="9.5"
          y="9.5"
          width="5"
          height="5"
          rx="1"
          stroke={active ? "#e8a0bf" : "rgba(232,160,191,0.25)"}
          strokeWidth="1.5"
        />
      </svg>
    ),
  },
];

const BREADCRUMB_MAP: Record<string, string> = {
  "/settings": "Profile",
  "/settings/usage": "Usage",
  "/settings/billing": "Billing",
  "/settings/integrations": "Integrations",
  "/settings/tasks": "Tasks",
  "/settings/workflows": "Workflows",
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const currentLabel = (() => {
    if (BREADCRUMB_MAP[pathname]) return BREADCRUMB_MAP[pathname];
    if (pathname.startsWith("/settings/tasks/")) return "Tasks";
    return "Settings";
  })();

  const isActive = (item: (typeof NAV_ITEMS)[number]) => {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(item.href + "/");
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0d0a0e] font-sans text-emma-100">
      {/* Top bar */}
      <header className="flex items-center px-5 py-3 border-b border-surface-border bg-emma-950/90 backdrop-blur-2xl shrink-0">
        <div className="flex items-center gap-2.5">
          <Link
            href="/app"
            className="w-8 h-8 rounded-full bg-gradient-to-br from-emma-300 to-emma-400 flex items-center justify-center shrink-0"
          >
            <span className="font-display text-base italic text-emma-950">E</span>
          </Link>
          <span className="text-sm font-semibold tracking-wider text-emma-300">EMMA</span>
          <span className="text-emma-200/15 mx-0.5 select-none">|</span>
          <Link
            href="/settings"
            className="text-xs text-emma-200/35 hover:text-emma-200/60 transition-colors"
          >
            Settings
          </Link>
          {currentLabel !== "Settings" && (
            <>
              <span className="text-emma-200/15 text-xs select-none">›</span>
              <span className="text-xs font-medium text-emma-200/70">{currentLabel}</span>
            </>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[190px] shrink-0 border-r border-surface-border bg-emma-950/60 flex flex-col py-6">
          <div className="px-5 mb-5">
            <span className="text-[9px] font-medium text-emma-200/20 uppercase tracking-[0.2em]">
              Navigation
            </span>
          </div>

          <nav className="flex flex-col gap-0.5 px-3 flex-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                    active
                      ? "bg-emma-300/10 border border-emma-300/15 text-emma-200/90"
                      : "text-emma-200/35 hover:text-emma-200/55 hover:bg-surface border border-transparent"
                  }`}
                >
                  {item.icon(active)}
                  <span className="font-light">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Back to app */}
          <div className="px-3 mt-4 border-t border-surface-border pt-4">
            <Link
              href="/app"
              className="flex items-center gap-2 px-3 py-2 text-[11px] text-emma-200/25 hover:text-emma-200/50 transition-colors rounded-lg hover:bg-surface"
            >
              <span className="text-sm leading-none">←</span>
              Back to app
            </Link>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
