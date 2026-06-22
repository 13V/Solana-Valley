/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Optional Solana RPC endpoint (mainnet-beta). Set this in the Vercel env to a
  // dedicated provider (Helius/QuickNode/Alchemy); falls back to the public
  // cluster URL when unset. Used only for reading the SOL balance.
  readonly VITE_SOLANA_RPC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
