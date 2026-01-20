/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'concord-orange': '#E97A00',
        'concord-teal': '#0590AA',
        'concord-mango': '#F3B100',
        'concord-green': '#60A53F',
        'concord-gold': '#F9D772',
      },
      fontFamily: {
        'museo': ['museo', 'Georgia', 'serif'],
        'museo-sans': ['museo-sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
