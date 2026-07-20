/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        success: { 50: "#f0fdf4", 600: "#16a34a", 700: "#15803d" },
        warning: { 50: "#fffbeb", 600: "#d97706", 700: "#b45309" },
        error: { 50: "#fef2f2", 600: "#dc2626", 700: "#b91c1c" },
      },
      keyframes: {
        "slide-in": { "0%": { transform: "translateX(110%)", opacity: "0" }, "100%": { transform: "translateX(0)", opacity: "1" } },
        "fade-in": { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
      },
      animation: {
        "slide-in": "slide-in 0.25s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
      },
    },
  },
  plugins: [],
};
