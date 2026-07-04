import Link from "next/link";
import { Zap } from "lucide-react";

// The workflow builder preview was removed in Phase 5: it never persisted or
// executed workflows, and a dead builder UI misrepresents what Emma is.
// This route stays so old bookmarks land on an explanation instead of a 404.
export default function WorkflowsPage() {
  return (
    <div className="max-w-4xl mx-auto px-8 py-8">
      <h1 className="text-xl font-light text-emma-100">Workflows</h1>
      <div className="mt-8 rounded-2xl border border-surface-border bg-emma-950/40 p-8">
        <Zap className="h-6 w-6 text-emma-300/50" />
        <h2 className="mt-4 text-sm text-emma-100">Emma handles this through Routines</h2>
        <p className="mt-2 max-w-xl text-xs leading-relaxed text-emma-200/50">
          There&apos;s no separate workflow builder — recurring help lives in Emma&apos;s routines
          instead. Just ask her in chat (&ldquo;run my morning briefing&rdquo;) or let her suggest
          one when she notices a pattern in what you do together.
        </p>
        <p className="mt-3 max-w-xl text-xs leading-relaxed text-emma-200/50">
          You can review what she&apos;s working on under{" "}
          <Link href="/settings/tasks" className="text-emma-300/70 hover:text-emma-300 underline">
            Tasks
          </Link>{" "}
          and control how independently she acts in{" "}
          <Link href="/settings/profile" className="text-emma-300/70 hover:text-emma-300 underline">
            Profile → Autonomy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
