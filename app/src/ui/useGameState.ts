import { useEffect, useState } from 'react';
import { bus } from '../game/EventBus';
import type { UiState } from '../game/types';

const initial: UiState = { coins: 0, day: 1, selected: 'hoe', inventory: {} };

// Subscribes a component to the latest game state pushed over the EventBus.
export function useGameState(): UiState {
  const [state, setState] = useState<UiState>(initial);
  useEffect(() => bus.on('state', setState), []);
  return state;
}
