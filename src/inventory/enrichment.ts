/**
 * Enrich vault items with Destiny definitions + DIM tags so Stage exclusions work.
 * Best-effort perk/plug names when profile sockets + InventoryItem defs allow.
 * Pure helpers — I/O stays in idb-reader.
 * Tag extract lives in dim-api-profile (shared with Mirror write).
 */

import type {
  DefinitionMap,
  DestinyProfileResponseLike,
  DestinySocketEntryLike,
  ItemDefinitionLite,
  VaultItem,
} from "./types.js";
import { TIER_TYPE_EXOTIC } from "./types.js";
import {
  DIM_API_PROFILE_KEY,
  extractTagsFromDimApiProfile,
  type TagByItemId,
} from "../dim-api-profile/index.js";

export { DIM_API_PROFILE_KEY, extractTagsFromDimApiProfile, type TagByItemId };
export { TIER_TYPE_EXOTIC };

/** instanceId → enabled plug hashes (best-effort; empty map when sockets absent). */
export type PlugHashesByItemId = ReadonlyMap<string, readonly number[]>;

/** Common DIM idb-keyval keys for language tables (research: d2-manifest-*). */
export const MANIFEST_KEY_CANDIDATES = [
  "d2-manifest-en",
  "d2-manifest",
  "manifest-en",
] as const;

/**
 * Build DefinitionMap from DIM manifest JSON tables (InventoryItem).
 */
export function definitionsFromManifestTables(raw: unknown): DefinitionMap {
  const map = new Map<number, ItemDefinitionLite>();
  if (typeof raw !== "object" || raw === null) return map;
  const root = raw as Record<string, unknown>;
  // DIM may store { tables: { InventoryItem: {...} } } or flat InventoryItem
  const tables =
    (typeof root.tables === "object" && root.tables !== null
      ? (root.tables as Record<string, unknown>)
      : root) as Record<string, unknown>;
  const inv = tables.InventoryItem ?? tables.DestinyInventoryItemDefinition;
  if (typeof inv !== "object" || inv === null) return map;

  for (const [hashStr, def] of Object.entries(inv as Record<string, unknown>)) {
    const hash = Number(hashStr);
    if (!Number.isFinite(hash) || typeof def !== "object" || def === null) continue;
    const d = def as Record<string, unknown>;
    const display = d.displayProperties as Record<string, unknown> | undefined;
    const inventory = d.inventory as Record<string, unknown> | undefined;
    const lite: ItemDefinitionLite = {};
    if (typeof display?.name === "string") lite.name = display.name;
    if (typeof d.itemTypeDisplayName === "string") lite.itemTypeDisplayName = d.itemTypeDisplayName;
    if (typeof inventory?.tierType === "number") lite.tierType = inventory.tierType;
    if (typeof inventory?.tierTypeName === "string") lite.tierTypeName = inventory.tierTypeName;
    // Fallback: some table dumps put tier on root
    if (lite.tierType === undefined && typeof d.tierType === "number") lite.tierType = d.tierType;
    if (lite.tierTypeName === undefined && typeof d.tierTypeName === "string") {
      lite.tierTypeName = d.tierTypeName;
    }
    map.set(hash, lite);
  }
  return map;
}

export function applyDefinitions(items: VaultItem[], definitions: DefinitionMap): VaultItem[] {
  if (definitions.size === 0) return items;
  return items.map((item) => {
    const def = definitions.get(item.itemHash);
    if (!def) return item;
    const next: VaultItem = { ...item };
    if (def.name?.trim()) next.name = def.name.trim();
    if (def.tierTypeName) next.tierType = def.tierTypeName;
    if (def.itemTypeDisplayName) next.itemType = def.itemTypeDisplayName;
    if (def.tierType === TIER_TYPE_EXOTIC || (def.tierTypeName ?? "").toLowerCase() === "exotic") {
      next.isExotic = true;
    }
    return next;
  });
}

export function applyTags(items: VaultItem[], tags: TagByItemId): VaultItem[] {
  if (tags.size === 0) return items;
  return items.map((item) => {
    const tag = tags.get(item.id);
    if (!tag) return item;
    return { ...item, tag };
  });
}

/**
 * Collect enabled plug hashes from Destiny profile sockets by instance id.
 * Missing sockets table → empty map (never invents plugs).
 */
export function plugHashesFromProfile(
  profile: DestinyProfileResponseLike | null | undefined,
): PlugHashesByItemId {
  const map = new Map<string, number[]>();
  const data = profile?.itemComponents?.sockets?.data;
  if (!data || typeof data !== "object") return map;

  for (const [instanceId, entry] of Object.entries(data)) {
    if (!instanceId || instanceId === "0") continue;
    if (typeof entry !== "object" || entry === null) continue;
    const sockets = (entry as { sockets?: DestinySocketEntryLike[] }).sockets;
    if (!Array.isArray(sockets)) continue;
    const hashes: number[] = [];
    for (const sock of sockets) {
      if (!sock || typeof sock !== "object") continue;
      const plugHash = sock.plugHash;
      if (typeof plugHash !== "number" || !Number.isFinite(plugHash) || plugHash <= 0) {
        continue;
      }
      // Prefer enabled+visible plugs; omitted flags still take the hash (partial caches).
      // isVisible === false hides trackers/inactive sockets that are not real perks.
      if (sock.isEnabled === false || sock.isVisible === false) continue;
      hashes.push(plugHash);
    }
    if (hashes.length > 0) map.set(instanceId, hashes);
  }
  return map;
}

/**
 * Resolve plug hashes → display names via InventoryItem definitions.
 * Unknown hashes are skipped — never invents names.
 */
export function perkNamesFromPlugHashes(
  plugHashes: readonly number[],
  definitions: DefinitionMap,
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const hash of plugHashes) {
    const def = definitions.get(hash);
    const name = def?.name?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

/**
 * Attach optional `perks` when sockets + definitions resolve at least one name.
 * Items without socket data or resolvable plugs are left unchanged (no fake perks).
 */
export function applyPerks(
  items: VaultItem[],
  plugHashesByItemId: PlugHashesByItemId,
  definitions: DefinitionMap,
): VaultItem[] {
  if (plugHashesByItemId.size === 0 || definitions.size === 0) return items;
  return items.map((item) => {
    const hashes = plugHashesByItemId.get(item.id);
    if (!hashes || hashes.length === 0) return item;
    const perks = perkNamesFromPlugHashes(hashes, definitions);
    if (perks.length === 0) return item;
    return { ...item, perks };
  });
}

export function enrichVaultItems(
  items: VaultItem[],
  options: {
    definitions?: DefinitionMap;
    tags?: TagByItemId;
    /** Profile sockets → plug hashes by instance id (best-effort perks). */
    plugHashesByItemId?: PlugHashesByItemId;
  },
): VaultItem[] {
  let out = items;
  if (options.definitions) out = applyDefinitions(out, options.definitions);
  if (options.tags) out = applyTags(out, options.tags);
  if (options.definitions && options.plugHashesByItemId) {
    out = applyPerks(out, options.plugHashesByItemId, options.definitions);
  }
  return out;
}
