import path from "path";
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  publicDir: 'public',
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    // proxy: {
    //   '/api': 'http://localhost:3003'
    // },
    strictPort: true,
    watch: {
      usePolling: true,  // Required for Docker file watching
    },
  }
});