import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

const isHttps = process.env.HTTPS === 'true' || process.env.SSL === 'true';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    ...(isHttps ? [basicSsl()] : []),
  ],
  server: {
    host: true,
    port: 5174,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
});
