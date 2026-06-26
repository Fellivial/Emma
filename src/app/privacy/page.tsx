import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#0d0a0e] text-emma-100 font-sans px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <Link href="/landing" className="text-xs text-emma-300/60 hover:text-emma-300">
          Back to Emma
        </Link>
        <h1 className="text-3xl font-light mt-8 mb-4">Privacy</h1>
        <div className="space-y-4 text-sm font-light text-emma-200/55 leading-relaxed">
          <p>
            Emma stores account data, settings, memories, conversations, files, and usage records
            needed to provide the companion experience.
          </p>
          <p>
            Conversations are not used to train models. Sensitive memory and conversation fields are
            encrypted at rest where the application stores them.
          </p>
          <p>
            Signed-in users can export or delete directly user-owned Emma data from Settings, under
            Data & Privacy.
          </p>
        </div>
      </div>
    </main>
  );
}