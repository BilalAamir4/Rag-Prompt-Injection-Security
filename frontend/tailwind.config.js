/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#08090C',
        'bg-sidebar': '#0B0D12',
        panel: '#0E1015',
        'panel-2': '#12151D',
        border: '#1E2230',
        'border-strong': '#2C3040',
        violet: '#8B7FE8',
        'violet-dim': 'rgba(139,127,232,0.14)',
        red: '#E15A5A',
        'red-dim': 'rgba(225,90,90,0.14)',
        teal: '#6FBFA0',
        'teal-dim': 'rgba(111,191,160,0.14)',
        amber: '#E3A23C',
        'amber-dim': 'rgba(227,162,60,0.14)',
        'text-primary': '#E7E6EE',
        'text-secondary': '#8A8CA0',
        'text-muted': '#565A6B',
      },
      fontFamily: {
        sans: ["'IBM Plex Sans'", '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ["'IBM Plex Mono'", "'SF Mono'", 'monospace'],
      },
    },
  },
  plugins: [],
}
