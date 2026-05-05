import type { ReactNode } from "react";
import type { Metadata } from "next";
import {
  Bebas_Neue,
  Barlow_Condensed,
  Barlow,
  JetBrains_Mono,
} from "next/font/google";

const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-l-display",
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  weight: ["700", "900"],
  subsets: ["latin"],
  variable: "--font-l-cond",
  display: "swap",
});

const barlow = Barlow({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-l-body",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-l-mono",
  display: "swap",
});

export const metadata: Metadata = {
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
  themeColor: "#e8547a",
};

export default function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={[
        bebasNeue.variable,
        barlowCondensed.variable,
        barlow.variable,
        jetbrainsMono.variable,
      ].join(" ")}
      style={{ background: "var(--l-bg)", color: "var(--l-text)" }}
    >
      {children}
    </div>
  );
}
