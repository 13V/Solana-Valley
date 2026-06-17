import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

// @solana/web3.js and the wallet adapters expect Node globals (Buffer, process)
// that don't exist in the browser, so we polyfill them for the client bundle.
export default defineConfig({
  // Relative base so the built bundle works whether served from a domain root
  // (local preview) or a subpath (GitHub Pages project site).
  base: './',
  plugins: [
    react(),
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  server: { port: 5173 },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      // Multi-page build: the game (index.html) plus the static docs sub-site
      // served at /docs/ (its own page, no game bundle — loads instantly).
      input: {
        main: resolve(root, 'index.html'),
        docs: resolve(root, 'docs/index.html'),
      },
      output: {
        // Split the big vendor libs into their own cacheable chunks.
        manualChunks: {
          phaser: ['phaser'],
          solana: [
            '@solana/web3.js',
            '@solana/wallet-adapter-base',
            '@solana/wallet-adapter-react',
            '@solana/wallet-adapter-react-ui',
            '@solana/wallet-adapter-wallets',
          ],
        },
      },
    },
  },
});
