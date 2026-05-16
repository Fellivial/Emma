import Link from "next/link";
import { requireClientAccess } from "./_lib/auth";

export default async function BusinessLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { client } = await requireClientAccess(slug);

  return (
    <div className="min-h-screen bg-emma-950 font-sans text-emma-100">
      {/* Top nav */}
      <div className="border-b border-surface-border bg-emma-950/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-0 flex items-center justify-between">
          {/* Brand + client */}
          <div className="flex items-center gap-3 py-3">
            <div className="w-6 h-6 rounded-full bg-emma-300/20 flex items-center justify-center text-[11px] font-bold text-emma-300">
              E
            </div>
            <span className="text-xs font-medium text-emma-200/50">{client.name}</span>
          </div>

          {/* Nav links */}
          <nav className="flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
            <Link
              href={`/business/${slug}`}
              className="px-3 py-2 text-xs text-emma-200/50 hover:text-emma-200/80 hover:bg-surface rounded-md transition-colors"
            >
              Overview
            </Link>
            <Link
              href={`/business/${slug}/leads`}
              className="px-3 py-2 text-xs text-emma-200/50 hover:text-emma-200/80 hover:bg-surface rounded-md transition-colors"
            >
              Leads
            </Link>
            <Link
              href={`/business/${slug}/settings`}
              className="px-3 py-2 text-xs text-emma-200/50 hover:text-emma-200/80 hover:bg-surface rounded-md transition-colors"
            >
              Settings
            </Link>
            <a
              href={`/intake/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 text-xs text-emma-200/30 hover:text-emma-200/60 hover:bg-surface rounded-md transition-colors"
            >
              Intake ↗
            </a>
          </nav>

          {/* Back */}
          <Link
            href="/app"
            className="text-[11px] text-emma-200/20 hover:text-emma-200/50 transition-colors py-3"
          >
            ← Emma
          </Link>
        </div>
      </div>

      {children}
    </div>
  );
}
