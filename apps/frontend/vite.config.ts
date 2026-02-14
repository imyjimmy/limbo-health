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
  // optimizeDeps: {
  //   include: [
  //     '@noble/curves/secp256k1',
  //     '@noble/hashes/hkdf',
  //     '@noble/hashes/sha2',
  //     '@noble/hashes/hmac',
  //     '@noble/hashes/utils',
  //     '@noble/ciphers/chacha',
  //   ],
  // },
  publicDir: 'public',
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@noble/curves/secp256k1": path.resolve(__dirname, "node_modules/@noble/curves/secp256k1.js"),
      "@noble/hashes/hkdf": path.resolve(__dirname, "node_modules/@noble/hashes/hkdf.js"),
      "@noble/hashes/sha2": path.resolve(__dirname, "node_modules/@noble/hashes/sha2.js"),
      "@noble/hashes/hmac": path.resolve(__dirname, "node_modules/@noble/hashes/hmac.js"),
      "@noble/hashes/utils": path.resolve(__dirname, "node_modules/@noble/hashes/utils.js"),
      "@noble/ciphers/chacha": path.resolve(__dirname, "node_modules/@noble/ciphers/chacha.js"),
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