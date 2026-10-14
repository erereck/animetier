import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps the build portable: it works at the domain root or under /animetier/ on GitHub Pages.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5181 },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
});
