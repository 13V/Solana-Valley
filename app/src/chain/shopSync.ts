// Authoritative shared-shop state via a Supabase table (see supabase/shop.sql).
//
// The shop POOL is still computed client-side (deterministic per island+window,
// scaled by the online player count). What the DB makes authoritative is how
// many of each seed have been BOUGHT this window: a `shop_buys` table holds one
// row per (island, window, plant), and an atomic `buy_seed` RPC increments it
// only while it's below the pool cap — so the last unit can't be double-sold and
// late-joiners read the true remaining count instead of guessing.
//
// Everything here is best-effort: if the table/RPC isn't set up (or the network
// fails), the calls return null and the game falls back to its local broadcast
// model, exactly like the rest of the multiplayer layer.
import { supabase } from './supabase';

// Read the bought-counts for an island's current window. null => DB unavailable.
export async function fetchShopBought(
  island: number,
  window: number,
): Promise<Record<string, number> | null> {
  try {
    const { data, error } = await supabase
      .from('shop_buys')
      .select('plant,bought')
      .eq('island', island)
      .eq('window', window);
    if (error || !data) return null;
    const out: Record<string, number> = {};
    for (const row of data as Array<{ plant: string; bought: number }>) {
      if (typeof row.plant === 'string' && typeof row.bought === 'number') out[row.plant] = row.bought;
    }
    return out;
  } catch {
    return null;
  }
}

// Atomically buy one unit of `plant` this window. Returns:
//   >= 1  the new authoritative bought count (success),
//   -1    sold out (already at the pool cap),
//   null  DB unavailable / not configured (caller falls back to local rules).
export async function buySeedRemote(
  island: number,
  window: number,
  plant: string,
  cap: number,
): Promise<number | null> {
  try {
    const { data, error } = await supabase.rpc('buy_seed', {
      p_island: island,
      p_window: window,
      p_plant: plant,
      p_cap: cap,
    });
    if (error) return null;
    return typeof data === 'number' ? data : null;
  } catch {
    return null;
  }
}
