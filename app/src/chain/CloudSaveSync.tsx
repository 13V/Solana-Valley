import { useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { bus } from '../game/EventBus';
import { getWalletAuth, clearWalletAuth } from './walletAuth';
import {
  loadCloudSave,
  saveCloudSave,
  applyCloudSaveAndReload,
  type SignedSession,
} from './cloudSave';

// Mounted INSIDE <WalletProvider> (renders nothing). Bridges the connected
// Solana wallet to our serverless cloud-save endpoints:
//   - signs ONE message per session (re-signs only when the wallet changes)
//   - on connect, loads the cloud save and restores it locally if it differs
//   - on every game save (`bus.emit('saved', json)`), debounces ~5s then uploads
//
// Everything is best-effort: missing signMessage support, signing rejection, or
// network errors silently disable cloud save without affecting gameplay.
const SAVE_DEBOUNCE_MS = 5000;

export function CloudSaveSync() {
  const { publicKey, signMessage, connected } = useWallet();

  // Latest save JSON pending upload, plus its debounce timer.
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whether we've shown the "synced" toast yet this session (don't spam).
  const toastedRef = useRef(false);

  // Acquire (or reuse) a signed session for the connected wallet via the SHARED
  // wallet-auth helper, so cloud-save and multiplayer trigger a single signature
  // prompt. Returns null if signing is unavailable or the user rejects.
  const ensureSession = useRef<() => Promise<SignedSession | null>>(async () => null);
  ensureSession.current = async () => getWalletAuth(publicKey, signMessage);

  // On connect (and whenever the wallet changes): sign, then pull the cloud
  // save and restore it locally if it's the one to trust.
  useEffect(() => {
    if (!connected || !publicKey || !signMessage) {
      // Disconnected or no signing support: drop any cached auth so a different
      // wallet re-signs.
      clearWalletAuth();
      return;
    }

    let cancelled = false;
    (async () => {
      const session = await ensureSession.current();
      if (cancelled || !session) return;

      const result = await loadCloudSave(session);
      if (cancelled || !result) return;

      // Restore the cloud copy when present. applyCloudSaveAndReload handles
      // the "no local save OR cloud differs from local" decision and guards a
      // once-per-session reload, so it safely no-ops when cloud === local.
      if (result.data != null) {
        applyCloudSaveAndReload(result.data);
      }
    })();

    return () => {
      cancelled = true;
    };
    // publicKey identity changes when the wallet switches.
  }, [connected, publicKey, signMessage]);

  // Debounced upload on every local save.
  useEffect(() => {
    const flush = async () => {
      timerRef.current = null;
      const json = pendingRef.current;
      pendingRef.current = null;
      if (!json) return;
      // Only upload if we can (have a wallet + signature this session).
      if (!publicKey || !signMessage) return;
      const session = await ensureSession.current();
      if (!session) return;

      let data: unknown;
      try {
        data = JSON.parse(json);
      } catch {
        return;
      }

      const ok = await saveCloudSave(session, data);
      if (ok && !toastedRef.current) {
        toastedRef.current = true;
        bus.emit('toast', '☁ Cloud save synced');
      }
    };

    const unsubscribe = bus.on('saved', (json) => {
      // Don't bother queueing if there's no connected wallet to save under.
      if (!publicKey || !signMessage) return;
      pendingRef.current = json;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void flush();
      }, SAVE_DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [publicKey, signMessage]);

  return null;
}
