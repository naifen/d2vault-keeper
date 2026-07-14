/**
 * Read DIM IDB profile cache (keyval-store / keyval).
 * Loads definitions + dim-api tags so Stage exclusions see isExotic / favorite.
 * Never create/upgrade DIM’s database.
 */

import { membershipProfileKey, resolveMembershipId, LAST_MEMBERSHIP_KEY } from "./membership.js";
import { extractVaultItems } from "./extract.js";
import {
  definitionsFromManifestTables,
  DIM_API_PROFILE_KEY,
  enrichVaultItems,
  extractTagsFromDimApiProfile,
  MANIFEST_KEY_CANDIDATES,
  plugHashesFromProfile,
} from "./enrichment.js";
import type { DefinitionMap, DestinyProfileResponseLike, InventoryStatus, VaultItem } from "./types.js";

export const IDB_DB_NAME = "keyval-store";
export const IDB_STORE_NAME = "keyval";

export type LocalStorageGet = (key: string) => string | null;

export interface IdbKeyval {
  get<T = unknown>(key: string): Promise<T | undefined>;
  /** Optional write (Mirror junk path). */
  set?(key: string, value: unknown): Promise<void>;
}

export interface ReadVaultOptions {
  getLocalStorage: LocalStorageGet;
  idb: IdbKeyval;
  /** Optional inject; when omitted, loaded from DIM IDB automatically. */
  definitions?: DefinitionMap;
  /** When false, skip dim-api-profile / manifest enrichment (tests). Default true. */
  enrich?: boolean;
}

async function loadDefinitionsFromIdb(idb: IdbKeyval): Promise<DefinitionMap> {
  for (const key of MANIFEST_KEY_CANDIDATES) {
    const raw = await idb.get(key);
    if (raw === undefined) continue;
    const defs = definitionsFromManifestTables(raw);
    if (defs.size > 0) return defs;
  }
  return new Map();
}

export async function readVaultInventory(options: ReadVaultOptions): Promise<InventoryStatus> {
  try {
    const membershipId = resolveMembershipId(options.getLocalStorage);
    if (!membershipId) {
      return {
        state: "empty",
        reason: "no-membership",
        message: "Open DIM logged in (no membership id in this tab).",
      };
    }

    const key = membershipProfileKey(membershipId);
    const profile = await options.idb.get<DestinyProfileResponseLike>(key);
    if (!profile) {
      return {
        state: "empty",
        reason: "no-profile",
        message: "Open DIM logged in — profile cache not found. Refresh inventory in DIM.",
      };
    }

    const shouldEnrich = options.enrich !== false;
    let items: VaultItem[] = extractVaultItems(profile);

    if (shouldEnrich) {
      let definitions = options.definitions;
      if (definitions === undefined) {
        definitions = await loadDefinitionsFromIdb(options.idb);
      }
      const dimApi = await options.idb.get(DIM_API_PROFILE_KEY);
      const tags = extractTagsFromDimApiProfile(dimApi, membershipId);
      const plugHashesByItemId = plugHashesFromProfile(profile);
      items = enrichVaultItems(items, {
        ...(definitions !== undefined && definitions.size > 0 ? { definitions } : {}),
        tags,
        ...(plugHashesByItemId.size > 0 ? { plugHashesByItemId } : {}),
      });
    }

    if (items.length === 0) {
      return {
        state: "empty",
        reason: "no-vault-items",
        message: "Vault cache is empty. Open DIM inventory with a warm vault cache.",
      };
    }

    return { state: "ok", membershipId, items, source: "idb" };
  } catch (err) {
    return {
      state: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export type OpenDbFn = (name: string) => IDBOpenDBRequest;
export type ListDatabasesFn = () => Promise<IDBDatabaseInfo[]>;

/**
 * Browser adapter: open DIM's existing keyval IDB only.
 * Refuses to create a new empty keyval-store (would poison DIM).
 * Supports read + write for Mirror tag path.
 */
export function createBrowserIdbKeyval(
  openDb: OpenDbFn = (name) => indexedDB.open(name),
  listDatabases: ListDatabasesFn | undefined =
    typeof indexedDB.databases === "function"
      ? () => indexedDB.databases()
      : undefined,
): IdbKeyval {
  let dbPromise: Promise<IDBDatabase> | null = null;

  async function ensureDimDbExists(): Promise<void> {
    if (!listDatabases) return;
    const dbs = await listDatabases();
    const found = dbs.some((d) => d.name === IDB_DB_NAME);
    if (!found) {
      throw new Error("Open DIM logged in — IndexedDB profile cache not found.");
    }
  }

  function getDb(): Promise<IDBDatabase> {
    if (!dbPromise) {
      dbPromise = (async () => {
        await ensureDimDbExists();
        return new Promise<IDBDatabase>((resolve, reject) => {
          const req = openDb(IDB_DB_NAME);
          req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
          req.onblocked = () => reject(new Error("IDB open blocked"));
          req.onupgradeneeded = () => {
            try {
              req.transaction?.abort();
            } catch {
              // ignore
            }
            reject(new Error("Open DIM logged in — refusing to create empty DIM cache."));
          };
          req.onsuccess = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
              db.close();
              reject(new Error("Open DIM logged in — keyval store missing."));
              return;
            }
            resolve(db);
          };
        });
      })().catch((err) => {
        // Allow retry after transient missing-DB (DIM not warm yet).
        dbPromise = null;
        throw err;
      });
    }
    return dbPromise;
  }

  return {
    async get<T>(key: string): Promise<T | undefined> {
      const db = await getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE_NAME, "readonly");
        const store = tx.objectStore(IDB_STORE_NAME);
        const req = store.get(key);
        req.onerror = () => reject(req.error ?? new Error("IDB get failed"));
        req.onsuccess = () => resolve(req.result as T | undefined);
      });
    },
    async set(key: string, value: unknown): Promise<void> {
      const db = await getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE_NAME, "readwrite");
        const store = tx.objectStore(IDB_STORE_NAME);
        const req = store.put(value, key);
        req.onerror = () => reject(req.error ?? new Error("IDB put failed"));
        req.onsuccess = () => resolve();
      });
    },
  };
}

export function browserLocalStorageGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export { LAST_MEMBERSHIP_KEY };
