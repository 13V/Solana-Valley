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
  'ui:redeemStack': { key: string; count: number }; // remove a redeemed stack (after the server credits $SPROUT)
  'ui:buyUpgrade': string; // upgrade id
  'ui:chooseUpgradeFork': { id: UpgradeId; fork: string }; // pick a maxed upgrade's 1-of-2 specialization
  'ui:buyAnimal': string; // animal id
  'ui:buyExpansion': void; // buy the next crop-bed expansion column
  'ui:choosePerk': { skill: SkillId; level: number; perk: string }; // pick a milestone perk
  'ui:unlockFishNode': string; // Angler's Tree node id -> spend points to unlock
  'ui:respecPerks': void; // clear all chosen perks (escalating coin cost) to re-pick milestones

  // --- Real-time multiplayer bridge (ids are wallet base58 addresses) ---
  'mp:self': { x: number; y: number; facing: string }; // FarmScene -> network (throttled): local player pose
  'mp:assigned': { id: string; island: number; plot: number }; // network -> FarmScene, after /api/join assigns a stable plot (id = our own wallet, so we can exclude ourselves from the roster)
  'mp:roster': Array<{ id: string; name: string; plot: number }>; // network -> FarmScene: who's online (presence sync)
  'mp:move': { id: string; x: number; y: number; facing: string }; // network -> FarmScene: a remote player moved
  'mp:leave': { id: string }; // network -> FarmScene: a remote player left
  'mp:status': string; // network -> UI: human-readable status line (also mirrored to 'toast')
  // Live farm sync: a compact snapshot of a player's farm, RELATIVE to their
  // plot origin. Crops: each tuple is [dx, dy, plantId, grownMs, growMs,
  // mature(0|1), mutId('' = none)] — peers simulate growth from grownMs/growMs
  // for smoothness. Tilled: each tuple is [dx, dy] for a tilled-soil tile, so a
  // peer's dirt beds render under their crops (older clients omit `tilled`).
  'mp:farm': { crops: Array<[number, number, string, number, number, 0 | 1, string]>; tilled: Array<[number, number]> }; // FarmScene -> network (no id/plot; net stamps the sender's current.id/plot, like mp:self)
  'mp:remoteFarm': { id: string; plot: number; crops: Array<[number, number, string, number, number, 0 | 1, string]>; tilled: Array<[number, number]> }; // network -> FarmScene: a remote player's farm snapshot
  // Shared island seed shop: the stock pool is shared by everyone on the island,
  // so a purchase must drain it for all peers. FarmScene broadcasts each local
  // buy; the network echoes remote buys back so every client decrements the pool.
  'mp:shopBuy': { plantId: string }; // FarmScene -> network: we bought one of this seed
  'mp:shopBought': { id: string; plantId: string }; // network -> FarmScene: a peer bought one (id = buyer)
  'mp:reverify': void; // FarmScene -> network: another player shares our plot; re-check our seat with the server NOW
  'mp:chatSend': { text: string }; // UI -> network: send a chat line to the island
  'mp:chat': { id: string; name: string; text: string }; // network -> UI: a chat line arrived from a peer
  // Fishing catch broadcast: a local catch is announced so peers can animate the
  // fish flying into our avatar (cosmetic only — no coins/XP awarded on receive).
  'mp:catch': { fishId: string; rarity: number; x: number; y: number }; // FarmScene -> network: we landed a fish (net stamps our id)
  'mp:remoteCatch': { id: string; fishId: string; rarity: number; x: number; y: number }; // network -> FarmScene: a peer landed a fish
  // Player action/animation broadcast so peers see each other tilling, watering
  // and fishing (not just walking/idling). `action` is 'hoe' | 'water' |
  // 'fish-cast' | 'fish-wait' | 'fish-reel' | 'fish-catch' | 'fish-end'.
  'mp:act': { action: string; facing: string }; // FarmScene -> network: a local tool/fishing pose (net stamps our id)
  'mp:remoteAct': { id: string; action: string; facing: string }; // network -> FarmScene: a peer's pose to animate
  // Hub presence lifecycle. The home island is PRIVATE (it joins no channel, so
  // its dormant mp:* handlers never fire). The shared social hub is where
  // multiplayer lives: HubScene emits enterHub on create and exitHub on shutdown
  // so the network layer connects/disconnects the SHARED hub channel only while
  // the player is actually standing on the hub.
  'mp:enterHub': void; // HubScene -> network: connect me to the shared hub channel
  'mp:exitHub': void; // HubScene -> network: disconnect me from the hub channel
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
