import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// @solana/web3.js and the wallet adapters expect Node globals (Buffer, process)
// that don't exist in the browser, so we polyfill them for the client bundle.
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  server: { port: 5173 },
});
