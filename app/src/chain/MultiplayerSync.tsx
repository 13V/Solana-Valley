import { useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { bus } from '../game/EventBus';
import { getWalletAuth } from './walletAuth';
import { joinHub, leaveIsland } from './multiplayer';
import { useUsername } from './username';

// Mounted INSIDE <WalletProvider> (renders nothing). Bridges the connected
// Solana wallet to real-time multiplayer:
//   1. Reuse the SHARED signed wallet-auth (same one cloud-save uses, so the
//      user signs only ONCE per session).
//   2. POST it to /api/join to get a STABLE { island, plot } seat (recorded in
//      the save via 'mp:assigned'; the seat is single-player bookkeeping now).
//   3. Connect to the SHARED hub channel via joinHub() — but ONLY while the
//      player is standing on the social hub. The home island is PRIVATE: it
//      opens no channel, so peers never appear there. HubScene drives this with
//      'mp:enterHub'/'mp:exitHub' as the player sails in and out.
//
// On wallet change / disconnect / unmount it calls leaveIsland() (the universal
// channel teardown). Everything is best-effort: any failure silently disables
// multiplayer (single-player keeps working).
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

  // Whether the player is currently standing on the shared hub. Tracked in a ref
  // (independent of wallet state) so connecting a wallet WHILE already on the hub
  // still joins the channel, and so the flag survives the join effect re-running
  // (e.g. on a mid-session rename). Always listening, regardless of wallet.
  const onHubRef = useRef(false);
  useEffect(() => {
    const offEnter = bus.on('mp:enterHub', () => { onHubRef.current = true; });
    const offExit = bus.on('mp:exitHub', () => { onHubRef.current = false; });
    return () => {
      offEnter();
      offExit();
    };
  }, []);

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
    // Our hub identity, resolved once wallet-auth returns. The hub channel needs
    // only a stable id (the wallet) + a display name — it does NOT depend on
    // /api/join, so the hub still works even if that endpoint is unavailable.
    let identity: { id: string; name: string; plot: number } | null = null;
    // Connect to the shared hub channel, but only while the player is on the hub.
    const connectHub = () => {
      if (identity && onHubRef.current) joinHub(identity);
    };
    // Enter/exit the hub: connect/tear down the shared channel. (The always-on
    // effect above also tracks onHubRef; here we additionally act on it.)
    const offEnter = bus.on('mp:enterHub', () => {
      onHubRef.current = true;
      connectHub();
    });
    const offExit = bus.on('mp:exitHub', () => {
      onHubRef.current = false;
      leaveIsland();
    });

    (async () => {
      // Reuse the shared, cached signature (single prompt across features).
      const auth = await getWalletAuth(publicKey, signMessage);
      if (cancelled || !auth) return;

      // The wallet id + display name are all the shared hub needs. Record our
      // identity and, if the player already sailed onto the hub while auth was
      // resolving, connect to the channel now.
      identity = { id: auth.wallet, name: username || auth.wallet.slice(0, 4), plot: 0 };
      connectHub();

      // An invite link (?island=N) wins; otherwise resume our last seat from the
      // save (island + plot) so a returning player lands back on their own spot if
      // it's still free — and just gets the next available one if it's taken.
      const islandParam = new URLSearchParams(location.search).get('island');
      const inviteIsland = islandParam !== null && Number.isInteger(Number(islandParam)) && Number(islandParam) >= 0
        ? Number(islandParam)
        : undefined;
      let savedIsland: number | undefined;
      let savedPlot: number | undefined;
      try {
        const s = JSON.parse(localStorage.getItem('farm-lands:save') || 'null');
        if (s && Number.isInteger(s.island)) savedIsland = s.island;
        if (s && Number.isInteger(s.plotIndex)) savedPlot = s.plotIndex;
      } catch {
        // no/garbled save -> no preference
      }
      const initialIsland = inviteIsland ?? savedIsland;
      // Only ask for our exact old plot when resuming our OWN island (not on an
      // invite to someone else's).
      const initialPlot = inviteIsland !== undefined ? undefined : savedPlot;

      const buildBody = (prefer?: number, preferPlot?: number): Record<string, unknown> => {
        const body: Record<string, unknown> = { ...auth };
        if (prefer !== undefined && Number.isInteger(prefer) && prefer >= 0) body.preferIsland = prefer;
        if (preferPlot !== undefined && Number.isInteger(preferPlot) && preferPlot >= 0) body.preferPlot = preferPlot;
        // Re-send the name each time so a mid-session rename propagates via the
        // server's existing-wallet path.
        if (username) body.name = username;
        return body;
      };

      const postJoin = async (prefer?: number, preferPlot?: number): Promise<JoinResponse | null> => {
        try {
          const resp = await fetch('/api/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildBody(prefer, preferPlot)),
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

        // The home island is PRIVATE — we open no realtime channel here, so this
        // is just bookkeeping: record the server-assigned seat so the save keeps a
        // stable plot id. Multiplayer itself connects only on the shared hub.
        bus.emit('mp:assigned', { id: auth.wallet, island: next.island, plot: next.plot });
      };

      const initial = await postJoin(initialIsland, initialPlot);
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
      offEnter();
      offExit();
      leaveIsland();
    };
    // publicKey identity changes when the wallet switches. `username` is included
    // so choosing/changing the name re-runs join → re-tracks presence with it.
  }, [connected, publicKey, signMessage, username]);

  return null;
}
