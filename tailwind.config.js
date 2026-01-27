/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}",
    // jeśli używasz App Router:
    "./app/**/*.{js,ts,jsx,tsx}",
    // jeśli masz components poza src:
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ew: {
          primary: "rgb(var(--ew-primary) / <alpha-value>)",
          accent: "rgb(var(--ew-accent) / <alpha-value>)",
          bg: "rgb(var(--ew-bg) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};
