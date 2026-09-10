/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'DM Sans'", "system-ui"],
        display: ["'Playfair Display'", "Georgia"],
        mono: ["'DM Mono'", "monospace"],
      },
      keyframes: {
        fadeUp: {
          from: { opacity: 0, transform: "translateY(12px)" },
          to:   { opacity: 1, transform: "translateY(0)" },
        },
        pulse2: {
          "0%,100%": { opacity: 1 },
          "50%":     { opacity: 0.4 },
        },
      },
      animation: {
        "fade-up": "fadeUp 0.4s ease forwards",
        "pulse2":  "pulse2 1.4s ease infinite",
      },
    },
  },
  plugins: [],
}
