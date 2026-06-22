// One-tap "Update ready" pill. A live single-page app can't hot-swap its own
// code, but it *can* notice when a newer build has been deployed and reload into
// it. The reload is instant and lossless here because the farm autosaves to
// localStorage (and the cloud), so players never lose progress.
//
// How it works: every build bakes in __BUILD_ID__ and ships a matching
// version.json. This polls version.json; when the served build id differs from
// the one this tab booted with, a new deploy is live and we surface the pill.
// PROD-only — in dev there's no deployed version.json to poll.
import { useEffect, useState } from 'react';

declare const __BUILD_ID__: string;

const POLL_MS = 3 * 60 * 1000; // re-check every 3 minutes
// Relative to BASE_URL so it resolves whether served from a domain root
// (Vercel) or a subpath (GitHub Pages project site).
const VERSION_URL = `${import.meta.env.BASE_URL}version.json`;

export function UpdatePill() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD) return; // nothing deployed to poll against in dev
    let cancelled = false;
    let timer: number | undefined;

    const onVis = () => {
      if (document.visibilityState === 'visible') void check();
    };

    const check = async () => {
      try {
        const res = await fetch(VERSION_URL, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { build?: string };
        if (!cancelled && data.build && data.build !== __BUILD_ID__) {
          setStale(true);
          // Found a new build — stop polling; the pill is sticky from here.
          if (timer) window.clearInterval(timer);
          document.removeEventListener('visibilitychange', onVis);
        }
      } catch {
        /* offline / transient — try again on the next tick */
      }
    };

    timer = window.setInterval(check, POLL_MS);
    document.addEventListener('visibilitychange', onVis);
    void check(); // first check shortly after load

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  if (!stale) return null;

  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      title="A new version of Solana Valley is live. Tap to load it — your farm is saved."
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.25)',
        background: 'linear-gradient(180deg, #7bd66a 0%, #57b84d 100%)',
        color: '#10300c',
        fontSize: 13,
        fontWeight: 800,
        cursor: 'pointer',
        boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
        pointerEvents: 'auto',
        zIndex: 60,
        whiteSpace: 'nowrap',
        animation: 'valley-update-pop 0.35s ease-out',
      }}
    >
      <span aria-hidden="true">🌱</span>
      New update — tap to refresh
    </button>
  );
}
