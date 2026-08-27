import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // The web app only ever talks to the UpsieDaisy API, never to the bank
      // directly, so the same backend can serve a future mobile app.
      '/api': 'http://localhost:3001',
    },
  },
});
