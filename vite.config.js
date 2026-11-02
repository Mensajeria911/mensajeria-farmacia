import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  envDir: '../../',
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    port: 4175,
    strictPort: true,
    allowedHosts: ['tidy-planes-punch.loca.lt', '.trycloudflare.com']
  },
  preview: {
    allowedHosts: ['tidy-planes-punch.loca.lt', '.trycloudflare.com']
  },
  build: {
    target: 'es2022'
  }
});
