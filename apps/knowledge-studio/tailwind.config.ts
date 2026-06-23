import type { Config } from "tailwindcss";

/**
 * shadcn/Radix/Tailwind foundation (ADR-0007). Colours are driven by the CSS variables
 * in `src/styles/tokens.css` — including the **coverage RAG palette** shared with the
 * data track's Markdown matrices — so themes (light/dark) swap by re-binding variables,
 * the OCP-open extension point for theming.
 */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        muted: "hsl(var(--muted) / <alpha-value>)",
        "muted-foreground": "hsl(var(--muted-foreground) / <alpha-value>)",
        primary: "hsl(var(--primary) / <alpha-value>)",
        "primary-foreground": "hsl(var(--primary-foreground) / <alpha-value>)",
        // Coverage RAG palette (shared with the data-track coverage/gap matrices).
        "coverage-covered": "hsl(var(--coverage-covered) / <alpha-value>)",
        "coverage-partial": "hsl(var(--coverage-partial) / <alpha-value>)",
        "coverage-uncovered": "hsl(var(--coverage-uncovered) / <alpha-value>)",
      },
    },
  },
  plugins: [],
} satisfies Config;
