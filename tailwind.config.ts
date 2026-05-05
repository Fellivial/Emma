import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        emma: {
          50: "#fdf2f8",
          100: "#f9e0ee",
          200: "#f4c1dd",
          300: "#e8a0bf",
          400: "#c77dba",
          500: "#a85d9a",
          600: "#8a4080",
          900: "#1a1020",
          950: "#0d0a0e",
        },
        surface: {
          DEFAULT: "rgba(232,160,191,0.04)",
          hover: "rgba(232,160,191,0.08)",
          border: "rgba(232,160,191,0.1)",
          active: "rgba(232,160,191,0.15)",
        },
      },
      fontFamily: {
        sans: ["Outfit", "system-ui", "sans-serif"],
        display: ["Cormorant Garamond", "Georgia", "serif"],
        "l-display": ["var(--font-l-display)", "sans-serif"],
        "l-cond": ["var(--font-l-cond)", "sans-serif"],
        "l-body": ["var(--font-l-body)", "system-ui", "sans-serif"],
        "l-mono": ["var(--font-l-mono)", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease forwards",
        "slide-up": "slideUp 0.3s ease forwards",
        pulse: "pulse 1s ease infinite",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
