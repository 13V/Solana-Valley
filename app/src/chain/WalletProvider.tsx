import { type ReactNode, useMemo } from 'react';
import { clusterApiUrl } from '@solana/web3.js';
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';

// Wraps the app in Solana wallet context. Mainnet-beta: the RPC endpoint comes
// from VITE_SOLANA_RPC (set a reliable provider — Helius/QuickNode/Alchemy — in
// the Vercel env) and falls back to the public cluster URL, which is heavily
// rate-limited. The RPC is only used to read the SOL balance; wallet signing
// (cloud save + multiplayer auth) is network-independent.
export function WalletProvider({ children }: { children: ReactNode }) {
  const network = WalletAdapterNetwork.Mainnet;
  const endpoint = useMemo(
    () => import.meta.env.VITE_SOLANA_RPC || clusterApiUrl(network),
    [network],
  );
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}
