import { useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { bus } from '../game/EventBus';
import { getWalletAuth } from './walletAuth';
import { joinIsland, leaveIsland } from './multiplayer';
import { useUsername } from './username';

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
//
// HEARTBEAT: while connected, we re-POST /api/join every HEARTBEAT_MS with the
// SAME cached auth (+ preferIsland = our assigned island). The server's
// existing-wallet path refreshes our row's `updated_at` (and returns the SAME
// seat — never reassigns), keeping our plot from going "stale" and being
// reclaimed by another player. The interval is cleared on wallet change /
// disconnect / unmount. Abrupt exits (closed tab) just stop heartbeating, so the
// plot ages out and frees up on its own after the server's stale window.

// Refresh our seat well within the server's STALE_MS (~2 min) window so an
// active player never looks abandoned.
const HEARTBEAT_MS = 60_000; // ~1 minute

type JoinResponse = { island: number; plot: number; name: string };

export function MultiplayerSync() {
  const { publicKey, signMessage, connected } = useWallet();
  // The player's chosen display name (see UsernamePrompt). When set we pass it
  // to /api/join so it becomes our multiplayer presence name (the avatar label
  // peers see). Changing it re-runs the effect → re-joins → re-tracks presence.
  const username = useUsername(publicKey ? publicKey.toBase58() : null);

  useEffect(() => {
    // Not connected (or no signing support): make sure we're disconnected.
    if (!connected || !publicKey || !signMessage) {
      leaveIsland();
      return;
    }

    let cancelled = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let onVisible: (() => void) | null = null;
    let offReverify: (() => void) | null = null;

    (async () => {
      // Reuse the shared, cached signature (single prompt across features).
      const auth = await getWalletAuth(publicKey, signMessage);
      if (cancelled || !auth) return;

      // Honour an invite link (?island=N): ask /api/join to seat us on that
      // island if it has room (server falls back when full / on bad input).
      const islandParam = new URLSearchParams(location.search).get('island');
      const preferIsland = islandParam !== null ? Number(islandParam) : NaN;

      const buildBody = (prefer?: number): Record<string, unknown> => {
        const body: Record<string, unknown> = { ...auth };
        if (prefer !== undefined && Number.isInteger(prefer) && prefer >= 0) body.preferIsland = prefer;
        // Re-send the name each time so a mid-session rename propagates via the
        // server's existing-wallet path.
        if (username) body.name = username;
        return body;
      };

      const postJoin = async (prefer?: number): Promise<JoinResponse | null> => {
        try {
          const resp = await fetch('/api/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildBody(prefer)),
          });
          if (!resp.ok) return null;
          const json = (await resp.json()) as Partial<JoinResponse>;
          if (typeof json.island !== 'number' || typeof json.plot !== 'number' || typeof json.name !== 'string') {
            return null;
          }
          return { island: json.island, plot: json.plot, name: json.name };
        } catch {
          return null;
        }
      };

      // Our current seat. The server is authoritative: if a heartbeat comes back
      // with a DIFFERENT seat, our old plot was reclaimed (we went stale) and
      // we've been re-seated — so we re-point the game + presence to the new one.
      let seat: JoinResponse | null = null;
      const applySeat = (next: JoinResponse) => {
        if (cancelled) return;
        const first = seat === null;
        const moved = !first && (seat!.island !== next.island || seat!.plot !== next.plot);
        seat = next;
        if (!first && !moved) return; // unchanged seat (normal heartbeat) -> no-op

        bus.emit('mp:assigned', { id: auth.wallet, island: next.island, plot: next.plot });
        const status = `Joined island ${next.island} · plot ${next.plot}`;
        bus.emit('mp:status', status);
        bus.emit(
          'toast',
          moved
            ? `Your old plot was claimed — moved to island ${next.island} · plot ${next.plot}`
            : status,
        );
        // (Re)connect to the island's realtime channel; re-tracks presence with
        // the current plot so peers see us on the right one.
        joinIsland(next.island, { id: auth.wallet, name: next.name, plot: next.plot });
      };

      const initial = await postJoin(Number.isInteger(preferIsland) && preferIsland >= 0 ? preferIsland : undefined);
      if (cancelled || !initial) return; // best-effort: stay single-player
      applySeat(initial);

      // Heartbeat: re-POST /api/join (preferring our current island) so the
      // server refreshes our `updated_at`. We now READ the response and re-point
      // if it reassigned us (the bug fix: this used to be fire-and-forget).
      const beat = () => {
        void postJoin(seat?.island).then((next) => {
          if (next) applySeat(next);
        });
      };
      if (cancelled) return; // torn down mid-join -> don't start a stray interval
      heartbeat = setInterval(beat, HEARTBEAT_MS);
      // Mobile browsers throttle background timers, so a tab that's been away can
      // miss beats and get its plot reclaimed. Beat immediately on refocus to
      // re-confirm (and pick up any reassignment) as soon as we're visible again.
      onVisible = () => {
        if (document.visibilityState === 'visible') beat();
      };
      document.addEventListener('visibilitychange', onVisible);
      // The game asks us to re-verify when another player shows up on our plot;
      // an immediate beat lets the server re-point whoever actually lost the seat.
      offReverify = bus.on('mp:reverify', beat);
    })();

    return () => {
      cancelled = true;
      if (heartbeat !== null) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      if (onVisible) {
        document.removeEventListener('visibilitychange', onVisible);
        onVisible = null;
      }
      if (offReverify) {
        offReverify();
        offReverify = null;
      }
      leaveIsland();
    };
    // publicKey identity changes when the wallet switches. `username` is included
    // so choosing/changing the name re-runs join → re-tracks presence with it.
  }, [connected, publicKey, signMessage, username]);

  return null;
}
