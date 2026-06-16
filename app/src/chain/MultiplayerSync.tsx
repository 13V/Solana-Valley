import { useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { bus } from '../game/EventBus';
import { getWalletAuth } from './walletAuth';
import { joinIsland, leaveIsland } from './multiplayer';

// Mounted INSIDE <WalletProvider> (renders nothing). Bridges the connected
// Solana wallet to real-time multiplayer:
//   1. Reuse the SHARED signed wallet-auth (same one cloud-save uses, so the
//      user signs only ONCE per session).
//   2. POST it to /api/join to get a STABLE { island, plot } seat.
//   3. Emit 'mp:assigned' + 'mp:status' (and a toast), then connect to the
//      island's Realtime channel via joinIsland().
//
// On wallet change / disconnect / unmount it calls leaveIsland(). Everything is
// best-effort: any failure silently disables multiplayer (single-player keeps
// working).

type JoinResponse = { island: number; plot: number; name: string };

export function MultiplayerSync() {
  const { publicKey, signMessage, connected } = useWallet();

  useEffect(() => {
    // Not connected (or no signing support): make sure we're disconnected.
    if (!connected || !publicKey || !signMessage) {
      leaveIsland();
      return;
    }

    let cancelled = false;

    (async () => {
      // Reuse the shared, cached signature (single prompt across features).
      const auth = await getWalletAuth(publicKey, signMessage);
      if (cancelled || !auth) return;

      // Honour an invite link (?island=N): ask /api/join to seat us on that
      // island if it has room (server falls back when full / on bad input).
      const islandParam = new URLSearchParams(location.search).get('island');
      const preferIsland = islandParam !== null ? Number(islandParam) : NaN;
      const requestBody: Record<string, unknown> = { ...auth };
      if (Number.isInteger(preferIsland) && preferIsland >= 0) {
        requestBody.preferIsland = preferIsland;
      }

      let assignment: JoinResponse | null = null;
      try {
        const resp = await fetch('/api/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });
        if (!resp.ok) return; // best-effort: disable multiplayer silently
        const json = (await resp.json()) as Partial<JoinResponse>;
        if (
          typeof json.island !== 'number' ||
          typeof json.plot !== 'number' ||
          typeof json.name !== 'string'
        ) {
          return;
        }
        assignment = { island: json.island, plot: json.plot, name: json.name };
      } catch {
        return; // network error -> stay single-player
      }

      if (cancelled || !assignment) return;

      // Tell the game which seat it owns.
      bus.emit('mp:assigned', { island: assignment.island, plot: assignment.plot });

      const status = `Joined island ${assignment.island} · plot ${assignment.plot}`;
      bus.emit('mp:status', status);
      bus.emit('toast', status);

      // Connect to the island's realtime channel (presence + position relay).
      joinIsland(assignment.island, {
        id: auth.wallet,
        name: assignment.name,
        plot: assignment.plot,
      });
    })();

    return () => {
      cancelled = true;
      leaveIsland();
    };
    // publicKey identity changes when the wallet switches.
  }, [connected, publicKey, signMessage]);

  return null;
}
