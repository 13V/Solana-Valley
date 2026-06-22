// One-time localStorage key migration for the project rename (Farm Lands).
//
// Every persisted key used to be prefixed `solana-valley:` and is now
// `farm-lands:`. This copies any legacy key to its new name (without clobbering
// newer data) so existing players keep their save, settings, wallet auth,
// keybinds, and tutorial progress after the rename.
//
// NOTE: the literal `solana-valley:` below is the OLD prefix and must stay as-is
// — do not "rename" it. It runs as a side effect on import; main.tsx imports
// this module FIRST so the migration happens before anything reads storage.

const OLD_PREFIX = 'solana-valley:';
const NEW_PREFIX = 'farm-lands:';

export function migrateLegacyStorage(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    // Snapshot legacy keys first (don't mutate storage while iterating it).
    const legacy: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(OLD_PREFIX) && !k.startsWith(NEW_PREFIX)) legacy.push(k);
    }
    for (const oldKey of legacy) {
      const newKey = NEW_PREFIX + oldKey.slice(OLD_PREFIX.length);
      if (localStorage.getItem(newKey) === null) {
        const value = localStorage.getItem(oldKey);
        if (value !== null) localStorage.setItem(newKey, value);
      }
      // Legacy keys are left in place (harmless) so the migration is reversible.
    }
  } catch {
    /* storage unavailable (private mode / blocked) — nothing to migrate */
  }
}

// Run immediately on import (see note above).
migrateLegacyStorage();
