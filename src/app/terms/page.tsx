import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#0d0a0e] text-emma-100 font-sans px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <Link href="/landing" className="text-xs text-emma-300/60 hover:text-emma-300">
          Back to Emma
        </Link>
        <h1 className="text-3xl font-light mt-8 mb-4">Terms</h1>
        <div className="space-y-4 text-sm font-light text-emma-200/55 leading-relaxed">
          <p>
            Emma is an AI companion and automation product. Outputs may be incomplete or incorrect,
            and important actions should be reviewed before you rely on them.
          </p>
          <p>
            Users are responsible for the data, integrations, files, and tool actions they connect
            to Emma. Dangerous or external actions may require explicit approval.
          </p>
          <p>
            Paid plans, token limits, extra packs, cancellations, failed payments, and subscription
            status are handled through the billing provider and shown in Settings.
          </p>
        </div>
      </div>
    </main>
  );
}
