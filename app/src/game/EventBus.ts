import type { UiState, ClockState } from './types';
import type { SkillId } from './skills';
import type { UpgradeId } from './progression';

// Typed pub/sub bridge between the Phaser game (authoritative state) and the
// React UI overlay. The game emits `state`/`clock`/`toast`; the UI emits
// `ui:*` intents.
export interface GameEvents {
  state: UiState;
  clock: ClockState;
  toast: string;
  saved: string; // the save JSON string, emitted right after it's written to localStorage (for cloud sync)
  action: 'till' | 'plant' | 'water' | 'harvest' | 'sell'; // a core gameplay action just succeeded (for onboarding)
  'ui:selectTool': string; // 'hoe' | 'can' | 'seed'
  'ui:selectSeed': string; // plant id -> also switches to the seed tool
  'ui:buySeed': string; // plant id
  'ui:sellStack': string; // harvest stack key
  'ui:sellAll': void;
  'ui:buyUpgrade': string; // upgrade id
  'ui:chooseUpgradeFork': { id: UpgradeId; fork: string }; // pick a maxed upgrade's 1-of-2 specialization
  'ui:buyAnimal': string; // animal id
  'ui:buyExpansion': void; // buy the next crop-bed expansion column
  'ui:choosePerk': { skill: SkillId; level: number; perk: string }; // pick a milestone perk
  'ui:respecPerks': void; // clear all chosen perks (escalating coin cost) to re-pick milestones

  // --- Real-time multiplayer bridge (ids are wallet base58 addresses) ---
  'mp:self': { x: number; y: number; facing: string }; // FarmScene -> network (throttled): local player pose
  'mp:assigned': { island: number; plot: number }; // network -> FarmScene, after /api/join assigns a stable plot
  'mp:roster': Array<{ id: string; name: string; plot: number }>; // network -> FarmScene: who's online (presence sync)
  'mp:move': { id: string; x: number; y: number; facing: string }; // network -> FarmScene: a remote player moved
  'mp:leave': { id: string }; // network -> FarmScene: a remote player left
  'mp:status': string; // network -> UI: human-readable status line (also mirrored to 'toast')
}

type Handler<T> = (payload: T) => void;

class EventBus {
  // Internally untyped so a single map can hold handlers for every event; the
  // public methods restore full type safety per event key.
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
