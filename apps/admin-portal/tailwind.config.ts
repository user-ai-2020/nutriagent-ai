/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#2D6A4F", light: "#40916C", dark: "#1B4332" },
        accent: "#95D5B2",
      },
    },
  },
  plugins: [],
};
