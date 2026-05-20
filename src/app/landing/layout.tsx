import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: "Emma — AI Companion System",
  description:
    "Vertically-integrated AI companion with animated avatar, voice, vision, memory, and autonomous agent capabilities.",
  openGraph: {
    title: "Emma — AI Companion System",
    description:
      "Vertically-integrated AI companion with animated avatar, voice, vision, memory, and autonomous agent capabilities.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Emma — AI Companion System",
    description:
      "Vertically-integrated AI companion with animated avatar, voice, vision, memory, and autonomous agent capabilities.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#e8547a",
};

export default function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400,500&display=swap"
      />
      <div
        style={
          {
            background: "var(--l-bg)",
            color: "var(--l-text)",
            "--font-l-display": "'Cormorant Garamond', Georgia, serif",
            "--font-l-cond": "'Bebas Neue', sans-serif",
            "--font-l-body": "'Outfit', sans-serif",
            "--font-l-mono": "'JetBrains Mono', monospace",
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </>
  );
}
