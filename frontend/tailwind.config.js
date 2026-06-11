/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#0B0F1A',
          card: 'rgba(255,255,255,0.04)',
          'card-hover': 'rgba(255,255,255,0.07)',
          border: 'rgba(255,255,255,0.08)',
          dark: '#0B0F1A',
          green: '#22FF88',
          'green-soft': '#16C784',
          red: '#FF4D4F',
          blue: '#3B82F6',
          purple: '#8B5CF6',
          text: '#E2E8F0',
          muted: '#94A3B8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      backdropBlur: {
        glass: '14px',
      },
    },
  },
  plugins: [],
};
