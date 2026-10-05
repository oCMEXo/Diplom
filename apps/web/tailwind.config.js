const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: token("canvas"),
        surface: token("surface"),
        raised: token("raised"),
        line: token("line"),
        fg: token("fg"),
        muted: token("muted"),
        faint: token("faint"),
        accent: token("accent"),
        "accent-fg": token("accent-fg"),
        ok: token("ok"),
        bad: token("bad"),
        warn: token("warn"),
      },
      fontFamily: {
        sans: ['"Inter Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono Variable"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        pop: "0 12px 40px -8px rgb(0 0 0 / 0.45), 0 0 0 1px rgb(var(--line))",
        card: "0 1px 2px rgb(0 0 0 / 0.08), 0 0 0 1px rgb(var(--line))",
        glow: "0 0 0 1px rgb(var(--accent) / 0.5), 0 8px 30px -6px rgb(var(--accent) / 0.45)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        pop: {
          from: { opacity: "0", transform: "translateY(6px) scale(0.98)" },
          to: { opacity: "1", transform: "none" },
        },
        "slide-in": {
          from: { opacity: "0", transform: "translateX(-12px)" },
          to: { opacity: "1", transform: "none" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(24px)" },
          to: { opacity: "1", transform: "none" },
        },
        float: {
          "0%, 100%": { transform: "translate(0, 0)" },
          "50%": { transform: "translate(10px, -8px)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgb(var(--ok) / 0.5)" },
          "100%": { boxShadow: "0 0 0 6px rgb(var(--ok) / 0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.18s ease-out",
        pop: "pop 0.2s cubic-bezier(0.2, 0.9, 0.3, 1.2)",
        "slide-in": "slide-in 0.22s ease-out",
        "slide-in-right": "slide-in-right 0.22s ease-out",
        float: "float 7s ease-in-out infinite",
        "pulse-ring": "pulse-ring 1.8s ease-out infinite",
      },
    },
  },
  plugins: [],
};
