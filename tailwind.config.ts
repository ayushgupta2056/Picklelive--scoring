import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: "class",
  content: ["./client/index.html", "./client/src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1400px" } },
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "system-ui", "sans-serif"],
        display: ['"Barlow Condensed"', '"Inter Variable"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(198,255,0,.35), 0 0 24px -4px rgba(198,255,0,.45)",
        live: "0 0 0 1px rgba(255,59,92,.45), 0 0 32px -8px rgba(255,59,92,.55)",
        card: "0 1px 0 0 rgba(255,255,255,.04) inset, 0 8px 24px -12px rgba(0,0,0,.6)",
      },
      transitionTimingFunction: { out: "cubic-bezier(.16,1,.3,1)" },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        lime: { DEFAULT: "#C6FF00", 600: "#9ACC00" },
        live: "#FF3B5C",
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
      keyframes: {
        "pulse-dot": { "0%,100%": { opacity: "1", transform: "scale(1)" }, "50%": { opacity: ".4", transform: "scale(.8)" } },
        glow: { "0%,100%": { boxShadow: "0 0 0 0 rgba(198,255,0,.7)" }, "50%": { boxShadow: "0 0 0 8px rgba(198,255,0,0)" } },
      },
      animation: { "pulse-dot": "pulse-dot 1.4s ease-in-out infinite", glow: "glow 1.6s ease-in-out infinite" },
    },
  },
  plugins: [animate],
} satisfies Config;
