import type { Metadata } from "next";
import { Outfit, Cormorant_Garamond } from "next/font/google";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600"],
  variable: "--font-outfit",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EMMA",
  description: "Environment-Managing Modular Agent",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${outfit.variable} ${cormorant.variable}`}>
      <head>
        {/* defer lets HTML render before the cubism runtime executes */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/live2d/live2dcubismcore.min.js" defer />
      </head>
      <body className="antialiased">
        <ErrorBoundary>{children}</ErrorBoundary>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
