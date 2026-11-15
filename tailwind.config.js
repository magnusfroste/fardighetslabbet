/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
      colors: {
        bg: "#faf7f2",
        card: "#ffffff",
        ink: "#14181f",
        muted: "#5b6472",
        line: "#e7e2d9",
        accent: { DEFAULT: "#16a34a", soft: "#e9f6ed", dark: "#15803d" },
      },
      borderRadius: { card: "24px" },
    },
  },
  plugins: [],
};