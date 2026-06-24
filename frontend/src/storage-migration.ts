/**
 * One-time AsyncStorage key migration: fishcast.* -> anglerj.*
 *
 * Background: the app was previously named "FishCast" and shipped with
 * AsyncStorage keys prefixed `fishcast.`. After the rename to Anglerj we
 * want all keys to live under the `anglerj.` namespace. This helper runs
 * once on cold start and copies any legacy fishcast.* values onto the
 * matching anglerj.* keys, then marks the migration as complete so we
 * never repeat the work.
 *
 * The migration is intentionally idempotent and non-destructive:
 *  - if the new key already exists we KEEP it (newer data wins)
 *  - the legacy key is left in place for one release cycle so that any
 *    fallback reader (in case of crash mid-migration) still finds data
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export const STORAGE_MIGRATION_FLAG = "anglerj.migration.v1_complete";

/** old fishcast.* key -> new anglerj.* key */
export const KEY_MIGRATIONS: Array<[string, string]> = [
  ["fishcast.user_id", "anglerj.user_id"],
  ["fishcast.location", "anglerj.location"],
  ["fishcast.units", "anglerj.units"],
  ["fishcast.legal_acceptance", "anglerj.legal_acceptance"],
  ["fishcast.prefs", "anglerj.prefs"],
];

let _migrationPromise: Promise<void> | null = null;

export async function ensureLegacyKeysMigrated(): Promise<void> {
  if (_migrationPromise) return _migrationPromise;
  _migrationPromise = (async () => {
    try {
      const done = await AsyncStorage.getItem(STORAGE_MIGRATION_FLAG);
      if (done === "1") return;
      const reads = await AsyncStorage.multiGet([
        ...KEY_MIGRATIONS.map(([from]) => from),
        ...KEY_MIGRATIONS.map(([, to]) => to),
      ]);
      const map = new Map(reads);
      const writes: [string, string][] = [];
      for (const [from, to] of KEY_MIGRATIONS) {
        const fromVal = map.get(from);
        const toVal = map.get(to);
        if (fromVal != null && (toVal == null || toVal === "")) {
          writes.push([to, fromVal]);
        }
      }
      if (writes.length > 0) await AsyncStorage.multiSet(writes);
      await AsyncStorage.setItem(STORAGE_MIGRATION_FLAG, "1");
    } catch {
      /* best-effort; missing data is recoverable on next launch */
    }
  })();
  return _migrationPromise;
}

/**
 * Read a value, transparently falling back to the legacy fishcast.* key
 * when the new key is empty. Used during the deprecation window only.
 */
export async function readWithLegacy(newKey: string): Promise<string | null> {
  const v = await AsyncStorage.getItem(newKey);
  if (v != null) return v;
  const found = KEY_MIGRATIONS.find(([, to]) => to === newKey);
  if (!found) return null;
  return AsyncStorage.getItem(found[0]);
}
