import Link from "next/link";

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[#0d0a0e] text-emma-100 font-sans px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <Link href="/landing" className="text-xs text-emma-300/60 hover:text-emma-300">
          Back to Emma
        </Link>
        <h1 className="text-3xl font-light mt-8 mb-4">Contact</h1>
        <p className="text-sm font-light text-emma-200/55 leading-relaxed mb-6">
          Emma is in closed beta and a dedicated contact inbox is not staffed yet. For enterprise
          access, billing, or beta questions, use the channel you were invited from, or see the
          Support page for what to include in a report.
        </p>
        <Link
          href="/support"
          className="inline-flex px-5 py-2.5 rounded-xl bg-gradient-to-r from-emma-300 to-emma-400 text-sm font-medium text-emma-950 hover:opacity-90 transition-opacity"
        >
          Support
        </Link>
      </div>
    </main>
  );
}
