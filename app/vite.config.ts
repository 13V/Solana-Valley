import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

// A stable id for this build. On Vercel it's the commit SHA; locally it's a
// timestamp. Baked into the client (as __BUILD_ID__) *and* written to
// version.json in the output, so a running tab can poll the file and notice when
// a newer build has been deployed (see ui/UpdatePill.tsx).
const BUILD_ID =
  (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '').slice(0, 12) ||
  String(Date.now());

// Emit /version.json alongside the bundle. Using emitFile keeps it in whatever
// the output dir is, with a stable (un-hashed) name so the poller can fetch it.
function versionStamp(buildId: string): Plugin {
  return {
    name: 'valley-version-stamp',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ build: buildId }),
      });
    },
  };
}

// @solana/web3.js and the wallet adapters expect Node globals (Buffer, process)
// that don't exist in the browser, so we polyfill them for the client bundle.
export default defineConfig({
  // Relative base so the built bundle works whether served from a domain root
  // (local preview) or a subpath (GitHub Pages project site).
  base: './',
  // Bake the build id in so the client can compare itself against version.json.
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
    }),
    versionStamp(BUILD_ID),
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
