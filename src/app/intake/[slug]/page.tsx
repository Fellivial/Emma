import { loadClientConfigOrNull } from "@/core/client-config";
import IntakeChat from "./_components/IntakeChat";
import IntakeForm from "./_components/IntakeForm";

// ─── Unavailable page ─────────────────────────────────────────────────────────
// Rendered for both unknown slugs and inactive clients.
// Returns HTTP 200 (not 404) so unknown and inactive slugs are indistinguishable
// at the network level — prevents tenant enumeration via status code.

function IntakeUnavailable() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#0d0a0e",
        color: "#f5f0f7",
        fontFamily: "Outfit, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "#e8547a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            fontWeight: 700,
            color: "#fff",
            margin: "0 auto 1.5rem",
          }}
        >
          E
        </div>
        <p style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.4)", margin: 0 }}>
          This intake page is unavailable.
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function IntakePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const config = await loadClientConfigOrNull(slug);

  if (!config) return <IntakeUnavailable />;

  if (config.formSteps?.length) {
    return <IntakeForm slug={slug} steps={config.formSteps} />;
  }

  return <IntakeChat slug={slug} />;
}
