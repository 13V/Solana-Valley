import { useEffect, useState } from 'react';
import { bus } from '../game/EventBus';

// Snapshot of the local player's multiplayer status for the React UI.
export interface MultiplayerState {
  connected: boolean; // an 'mp:assigned' has been received this session
  island: number | null; // assigned island, once connected
  plot: number | null; // assigned plot, once connected
  online: number; // current roster length (players online on this island)
}

const initialState: MultiplayerState = {
  connected: false,
  island: null,
  plot: null,
  online: 0,
};

// Cache the latest snapshot so a component that mounts *after* the mp:* events
// fired (e.g. the HUD re-rendering, or a panel opened later) still gets current
// values instead of the disconnected defaults. Mirrors useGameState.ts.
let latest: MultiplayerState = initialState;
const listeners = new Set<(s: MultiplayerState) => void>();

function publish(next: MultiplayerState): void {
  latest = next;
  listeners.forEach((l) => l(next));
}

bus.on('mp:assigned', ({ island, plot }) => {
  publish({ ...latest, connected: true, island, plot });
});
bus.on('mp:roster', (roster) => {
  publish({ ...latest, online: roster.length });
});

// Subscribes a component to the local player's multiplayer status. Returns the
// disconnected defaults in single-player (no wallet / no assignment yet).
export function useMultiplayer(): MultiplayerState {
  const [state, setState] = useState<MultiplayerState>(latest);
  useEffect(() => {
    setState(latest);
    const listener = (s: MultiplayerState) => setState(s);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return state;
}
