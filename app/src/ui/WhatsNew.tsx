// One-time "what's new" notice. Bump WHATS_NEW_VERSION whenever a notable update
// ships; returning players see a single toast the first time they load after the
// change. Stored per-browser so it never nags twice for the same version.
import { useEffect } from 'react';
import { bus } from '../game/EventBus';

const WHATS_NEW_KEY = 'solana-valley:whatsnew';
const WHATS_NEW_VERSION = '2026-06-22.1';
const WHATS_NEW_MESSAGE =
  "🌟 New in the Valley: daily quests & streaks, festival buffs, plant-family bonuses, and loads more crops, fish & fun!";

export function WhatsNew() {
  useEffect(() => {
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(WHATS_NEW_KEY);
    } catch {
      /* storage unavailable (private mode) — just skip */
    }
    if (seen === WHATS_NEW_VERSION) return;
    // Delay so it lands after the scene/HUD settle rather than fighting load.
    const t = window.setTimeout(() => {
      bus.emit('toast', WHATS_NEW_MESSAGE);
      try {
        localStorage.setItem(WHATS_NEW_KEY, WHATS_NEW_VERSION);
      } catch {
        /* ignore */
      }
    }, 2500);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
