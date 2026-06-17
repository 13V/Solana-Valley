// Real-time multiplayer engine built on Supabase Realtime (Presence +
// Broadcast). There is no game server:
//   - PRESENCE tracks who is online on an island (the roster). Each client
//     tracks { id, name, plot } under its own wallet-keyed presence key.
//   - BROADCAST carries high-frequency position updates ('pos' events) between
//     peers (self: false, so we never receive our own).
//
// This module bridges Supabase <-> the in-game EventBus. It NEVER throws into the
// game: every network/runtime failure is swallowed so single-player keeps
// working. Multiplayer is purely additive.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { bus } from '../game/EventBus';

// Identity of the local player on the island.
type Self = { id: string; name: string; plot: number };

// Shape we track in presence (mirrors Self).
type PresenceMeta = { id: string; name: string; plot: number };

// Broadcast 'pos' payload (a moved player).
type PosPayload = { id: string; x: number; y: number; facing: string };

// A single crop in a farm snapshot, RELATIVE to the sender's plot origin:
// [dx, dy, plantId, grownMs, growMs, mature(0|1), mutId('' = none)].
type CropTuple = [number, number, string, number, number, 0 | 1, string];

// A single tilled-soil tile in a farm snapshot, RELATIVE to the sender's plot
// origin: [dx, dy]. Visual-only; lets a peer's dirt beds render under their crops.
type TilledTuple = [number, number];

// Broadcast 'farm' payload (a player's full farm snapshot: crops + tilled soil).
type FarmPayload = { id: string; plot: number; crops: CropTuple[]; tilled: TilledTuple[] };

// Throttle local position broadcasts to ~10/sec.
const POS_INTERVAL_MS = 100;

// Throttle local FARM snapshots much slower than position — crops change rarely
// and the payload is larger. Trailing-flush so the latest snapshot always lands.
const FARM_INTERVAL_MS = 1800;

// Module-level singletons for the single active island connection. We only ever
// occupy one island at a time (the one /api/join assigned us).
let channel: RealtimeChannel | null = null;
let current: Self | null = null;

// Unsubscribe handles for the bus 'mp:self' / 'mp:farm' listeners.
let offSelf: (() => void) | null = null;
let offFarm: (() => void) | null = null;

// Throttle state for outgoing position broadcasts.
let lastSentAt = 0;
let lastSent: PosPayload | null = null;
let pending: PosPayload | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

// Throttle state for outgoing FARM (crop snapshot) broadcasts.
let lastFarmSentAt = 0;
let pendingFarm: FarmPayload | null = null;
let farmFlushTimer: ReturnType<typeof setTimeout> | null = null;

// The set of remote ids we last reported as present, so on each presence sync we
// can diff and emit 'mp:leave' for anyone who dropped.
let knownRemote = new Set<string>();

// True when two position payloads are identical (same tile + facing) -> skip the
// redundant broadcast.
function samePos(a: PosPayload | null, b: PosPayload): boolean {
  return !!a && a.x === b.x && a.y === b.y && a.facing === b.facing && a.id === b.id;
}

// Send a position payload over broadcast, guarded.
function sendPos(p: PosPayload): void {
  if (!channel) return;
  lastSentAt = Date.now();
  lastSent = p;
  pending = null;
  try {
    // Returns a promise; ignore the ack so a slow/failed send can't reject into
    // the game loop.
    void channel.send({ type: 'broadcast', event: 'pos', payload: p });
  } catch {
    // ignore — best effort
  }
}

// Handle a local-player pose from the game, throttled to POS_INTERVAL_MS and
// de-duplicated when unchanged.
function onSelfPose(pose: { x: number; y: number; facing: string }): void {
  if (!channel || !current) return;
  const payload: PosPayload = { id: current.id, x: pose.x, y: pose.y, facing: pose.facing };

  // Skip if nothing changed since the last thing we sent or queued.
  if (samePos(lastSent, payload) || samePos(pending, payload)) return;

  const now = Date.now();
  const elapsed = now - lastSentAt;
  if (elapsed >= POS_INTERVAL_MS) {
    sendPos(payload);
    return;
  }

  // Within the throttle window: remember the latest and schedule a trailing
  // flush so the final position always lands.
  pending = payload;
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      if (pending) sendPos(pending);
    }, POS_INTERVAL_MS - elapsed);
  }
}

// Send a farm snapshot over broadcast, guarded (mirrors sendPos).
function sendFarm(p: FarmPayload): void {
  if (!channel) return;
  lastFarmSentAt = Date.now();
  pendingFarm = null;
  try {
    // Ignore the ack so a slow/failed send can't reject into the game loop.
    void channel.send({ type: 'broadcast', event: 'farm', payload: p });
  } catch {
    // ignore — best effort
  }
}

// Handle a local-player crop snapshot from the game, throttled to
// FARM_INTERVAL_MS with a trailing flush so the latest snapshot always lands.
// The game emits { crops } with no id/plot; we stamp current.id/plot here
// (mirroring how onSelfPose stamps the id on a pose).
function onSelfFarm(snapshot: { crops: CropTuple[]; tilled: TilledTuple[] }): void {
  if (!channel || !current) return;
  const payload: FarmPayload = {
    id: current.id,
    plot: current.plot,
    crops: Array.isArray(snapshot.crops) ? snapshot.crops : [],
    tilled: Array.isArray(snapshot.tilled) ? snapshot.tilled : [],
  };

  const now = Date.now();
  const elapsed = now - lastFarmSentAt;
  if (elapsed >= FARM_INTERVAL_MS) {
    sendFarm(payload);
    return;
  }

  // Within the throttle window: coalesce to the latest snapshot and schedule a
  // trailing flush so the final state always lands.
  pendingFarm = payload;
  if (!farmFlushTimer) {
    farmFlushTimer = setTimeout(() => {
      farmFlushTimer = null;
      if (pendingFarm) sendFarm(pendingFarm);
    }, FARM_INTERVAL_MS - elapsed);
  }
}

// Rebuild the roster from presence state and emit it, plus 'mp:leave' for any
// remote peer that disappeared since the last sync.
function handlePresenceSync(): void {
  if (!channel || !current) return;
  let roster: PresenceMeta[] = [];
  try {
    const state = channel.presenceState<PresenceMeta>();
    // Each key maps to an array of presences (one per open tab for that key).
    for (const presences of Object.values(state)) {
      const first = presences[0];
      if (!first || typeof first.id !== 'string') continue;
      roster.push({ id: first.id, name: first.name, plot: first.plot });
    }
  } catch {
    return; // malformed state -> leave roster untouched
  }

  // De-dupe by id (defensive) and emit the full roster (includes self).
  const byId = new Map<string, PresenceMeta>();
  for (const m of roster) byId.set(m.id, m);
  roster = Array.from(byId.values());
  bus.emit('mp:roster', roster);

  // Diff against the previously-known REMOTE ids and announce leavers.
  const nowRemote = new Set<string>();
  for (const m of roster) {
    if (m.id !== current.id) nowRemote.add(m.id);
  }
  for (const id of knownRemote) {
    if (!nowRemote.has(id)) bus.emit('mp:leave', { id });
  }
  knownRemote = nowRemote;
}

// Join an island channel as `self`. Idempotent-ish: any existing connection is
// torn down first. Best-effort; never throws.
export function joinIsland(island: number, self: Self): void {
  try {
    // Drop any prior connection so switching islands is clean.
    leaveIsland();

    current = self;
    knownRemote = new Set<string>();
    lastSent = null;
    pending = null;
    lastSentAt = 0;
    lastFarmSentAt = 0;
    pendingFarm = null;

    const ch = supabase.channel(`island:${island}`, {
      config: {
        presence: { key: self.id },
        broadcast: { self: false },
      },
    });
    channel = ch;

    // Presence sync -> rebuild roster + emit leaves.
    ch.on('presence', { event: 'sync' }, () => {
      handlePresenceSync();
    });

    // Remote position updates -> tell the game.
    ch.on('broadcast', { event: 'pos' }, (msg) => {
      const p = (msg as { payload?: unknown }).payload as PosPayload | undefined;
      if (
        !p ||
        typeof p.id !== 'string' ||
        typeof p.x !== 'number' ||
        typeof p.y !== 'number' ||
        typeof p.facing !== 'string'
      ) {
        return;
      }
      // Ignore any stray echo of ourselves (broadcast self:false should prevent
      // this, but guard anyway).
      if (current && p.id === current.id) return;
      bus.emit('mp:move', p);
    });

    // Remote crop snapshots -> tell the game. Validate defensively: a malformed
    // payload (or our own echo) is ignored rather than emitted.
    ch.on('broadcast', { event: 'farm' }, (msg) => {
      const f = (msg as { payload?: unknown }).payload as FarmPayload | undefined;
      if (
        !f ||
        typeof f.id !== 'string' ||
        typeof f.plot !== 'number' ||
        !Array.isArray(f.crops)
      ) {
        return;
      }
      // Ignore any stray echo of ourselves (broadcast self:false should prevent
      // this, but guard anyway).
      if (current && f.id === current.id) return;
      // Backward-tolerant: older clients don't send `tilled` — treat a missing or
      // non-array value as "no tilled soil" so old/new clients interop cleanly.
      if (!Array.isArray(f.tilled)) f.tilled = [];
      bus.emit('mp:remoteFarm', f);
    });

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // Announce our presence once the channel is live.
        void ch.track({ id: self.id, name: self.name, plot: self.plot });
      }
    });

    // Forward throttled local poses + crop snapshots to the channel.
    offSelf = bus.on('mp:self', onSelfPose);
    offFarm = bus.on('mp:farm', onSelfFarm);
  } catch {
    // Any failure -> ensure we don't leave half-initialised state around.
    leaveIsland();
  }
}

// Leave the current island: untrack presence, remove the channel, and clear all
// listeners/state. Safe to call when not connected.
export function leaveIsland(): void {
  if (offSelf) {
    try {
      offSelf();
    } catch {
      // ignore
    }
    offSelf = null;
  }

  if (offFarm) {
    try {
      offFarm();
    } catch {
      // ignore
    }
    offFarm = null;
  }

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (farmFlushTimer) {
    clearTimeout(farmFlushTimer);
    farmFlushTimer = null;
  }

  const ch = channel;
  channel = null;
  current = null;
  knownRemote = new Set<string>();
  lastSent = null;
  pending = null;
  lastSentAt = 0;
  lastFarmSentAt = 0;
  pendingFarm = null;

  if (ch) {
    try {
      void ch.untrack();
    } catch {
      // ignore
    }
    try {
      void supabase.removeChannel(ch);
    } catch {
      // ignore
    }
  }
}
