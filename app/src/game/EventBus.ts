import type { UiState } from './types';

// Typed pub/sub bridge between the Phaser game (authoritative state) and the
// React UI overlay. The game emits `state`/`toast`; the UI emits `ui:*` intents.
export interface GameEvents {
  state: UiState;
  toast: string;
  'ui:selectTool': string; // hotbar slot id
  'ui:endDay': void;
  'ui:buySeed': string; // crop id
  'ui:sellCrop': string; // crop id
}

type Handler<T> = (payload: T) => void;

class EventBus {
  // Internally untyped (Handler<unknown>) so a single map can hold handlers for
  // every event; the public methods restore full type safety per event key.
  private handlers = new Map<keyof GameEvents, Set<Handler<unknown>>>();

  on<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<unknown>);
    return () => this.off(event, handler);
  }

  off<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): void {
    this.handlers.get(event)?.delete(handler as Handler<unknown>);
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    this.handlers.get(event)?.forEach((h) => (h as Handler<GameEvents[K]>)(payload));
  }
}

export const bus = new EventBus();
