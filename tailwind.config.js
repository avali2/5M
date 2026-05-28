/** @type {import('tailwindcss').Config} */
export default {
  content: ['./institutional-os.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        sigma: {
          bg: '#edf4ff',
          soft: '#f8fafc',
          card: '#ffffff',
          elevated: '#eef4fb',
          line: '#d7e2ef',
          gold: '#f5b942',
          green: '#22c55e',
          red: '#ef4444',
          amber: '#f59e0b',
          blue: '#2563eb',
          text: '#0f172a',
          muted: '#64748b'
        }
      },
      fontFamily: {
        sans: ['Segoe UI', 'Inter', 'Arial', 'sans-serif'],
        mono: ['Cascadia Mono', 'Consolas', 'monospace']
      },
      boxShadow: {
        panel: '0 18px 44px rgba(30, 64, 175, .08)'
      }
    }
  },
  plugins: []
};
