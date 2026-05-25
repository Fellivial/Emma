import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Bebas_Neue, JetBrains_Mono } from "next/font/google";

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-bebas",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});

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
    <div
      className={`${bebasNeue.variable} ${jetbrains.variable}`}
      style={
        {
          background: "var(--l-bg)",
          color: "var(--l-text)",
          "--font-l-display": "var(--font-cormorant), Georgia, serif",
          "--font-l-cond": "var(--font-bebas), sans-serif",
          "--font-l-body": "var(--font-outfit), system-ui, sans-serif",
          "--font-l-mono": "var(--font-jetbrains), monospace",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
