/** @type {import('tailwindcss').Config} */
export default {
  content: ['./institutional-os.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        sigma: {
          bg: '#070c17',
          soft: '#0c1425',
          card: '#111a2d',
          elevated: '#17233c',
          line: '#273453',
          gold: '#d6a434',
          green: '#18bf86',
          red: '#ef5961',
          amber: '#f4aa32',
          blue: '#4f8ff7',
          text: '#eff3fb',
          muted: '#91a0bc'
        }
      },
      fontFamily: {
        sans: ['Segoe UI', 'Inter', 'Arial', 'sans-serif'],
        mono: ['Cascadia Mono', 'Consolas', 'monospace']
      },
      boxShadow: {
        panel: '0 18px 44px rgba(0, 0, 0, .22)'
      }
    }
  },
  plugins: []
};
