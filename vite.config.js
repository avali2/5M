import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const buildTimestamp = process.env.VITE_VALIDO_BUILD_TIMESTAMP || new Date().toISOString();
const buildVersion = process.env.VITE_VALIDO_BUILD_VERSION ||
  process.env.RENDER_GIT_COMMIT?.slice(0, 7) ||
  `local-${buildTimestamp.replace(/[-:TZ.]/g, '').slice(0, 12)}`;

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_VALIDO_BUILD_VERSION': JSON.stringify(buildVersion),
    'import.meta.env.VITE_VALIDO_BUILD_TIMESTAMP': JSON.stringify(buildTimestamp)
  },
  build: {
    rollupOptions: {
      input: 'institutional-os.html',
      output: {
        manualChunks: {
          charts: ['recharts']
        }
      }
    }
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787'
    }
  }
});
