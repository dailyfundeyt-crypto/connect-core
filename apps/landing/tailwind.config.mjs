/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Cabinet Grotesk"', '"Inter"', "ui-sans-serif", "system-ui"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        // Brand: warm sky / soft cream palette
        cream: {
          50: "#FBF8F3",
          100: "#F6F0E5",
          200: "#EDE2CC",
        },
        sky: {
          400: "#38BDF8",
          500: "#0EA5E9",
          600: "#0284C7",
          700: "#0369A1",
        },
        ink: {
          50: "#F8F8F7",
          100: "#EDEDEB",
          200: "#D5D5D2",
          300: "#A8A8A4",
          400: "#71716D",
          500: "#3F3F3B",
          600: "#27272A",
          700: "#1A1A1C",
          800: "#111113",
          900: "#09090B",
        },
      },
      keyframes: {
        wiggle: {
          "0%, 100%": { transform: "rotate(-2deg)" },
          "50%": { transform: "rotate(2deg)" },
        },
        blink: {
          "0%, 92%, 100%": { transform: "scaleY(1)" },
          "95%": { transform: "scaleY(0.1)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        drawIn: {
          "0%": { strokeDashoffset: "1000" },
          "100%": { strokeDashoffset: "0" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        wiggle: "wiggle 2.4s ease-in-out infinite",
        blink: "blink 4s ease-in-out infinite",
        float: "float 4s ease-in-out infinite",
        marquee: "marquee 28s linear infinite",
        shimmer: "shimmer 2.4s linear infinite",
      },
      backgroundImage: {
        "paper-grain":
          "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.05) 1px, transparent 0)",
        "warm-gradient":
          "linear-gradient(135deg, #FBF8F3 0%, #F6F0E5 50%, #FCE7F3 100%)",
      },
      boxShadow: {
        soft: "0 1px 0 rgba(0,0,0,0.04), 0 8px 24px -12px rgba(2, 132, 199, 0.18)",
        "soft-lg":
          "0 1px 0 rgba(0,0,0,0.04), 0 24px 48px -20px rgba(2, 132, 199, 0.25)",
      },
    },
  },
  plugins: [],
};
