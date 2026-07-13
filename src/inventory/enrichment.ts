/**
 * Enrich vault items with Destiny definitions + DIM tags so Stage exclusions work.
 * Pure helpers — I/O stays in idb-reader.
 */

import type { DefinitionMap, ItemDefinitionLite, VaultItem } from "./types.js";

/** Destiny inventory tierType for Exotic. */
export const TIER_TYPE_EXOTIC = 6;

export const DIM_API_PROFILE_KEY = "dim-api-profile";

/** Common DIM idb-keyval keys for language tables (research: d2-manifest-*). */
export const MANIFEST_KEY_CANDIDATES = [
  "d2-manifest-en",
  "d2-manifest",
  "manifest-en",
] as const;

export type TagByItemId = ReadonlyMap<string, string>;

/**
 * Parse DIM Sync / local dim-api-profile blob for per-instance tags.
 * Shape: profiles[accountKey].tags[itemId].tag
 */
export function extractTagsFromDimApiProfile(
  raw: unknown,
  membershipId?: string,
): TagByItemId {
  const map = new Map<string, string>();
  if (typeof raw !== "object" || raw === null) return map;
  const root = raw as Record<string, unknown>;
  const profiles = root.profiles;
  if (typeof profiles !== "object" || profiles === null) return map;

  const profileEntries = Object.entries(profiles as Record<string, unknown>);
  for (const [accountKey, profile] of profileEntries) {
    // Match exact DIM account key prefix: `${membershipId}-d${version}` (not bare startsWith —
    // avoids "42" matching "421-d2").
    if (
      membershipId &&
      accountKey !== membershipId &&
      !accountKey.startsWith(`${membershipId}-d`)
    ) {
      continue;
    }
    if (typeof profile !== "object" || profile === null) continue;
    const tags = (profile as Record<string, unknown>).tags;
    if (typeof tags !== "object" || tags === null) continue;
    for (const [itemId, ann] of Object.entries(tags as Record<string, unknown>)) {
      if (typeof ann !== "object" || ann === null) continue;
      const tag = (ann as Record<string, unknown>).tag;
      if (typeof tag === "string" && tag.trim()) {
        map.set(itemId, tag.toLowerCase());
      }
    }
  }
  return map;
}

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

export function enrichVaultItems(
  items: VaultItem[],
  options: { definitions?: DefinitionMap; tags?: TagByItemId },
): VaultItem[] {
  let out = items;
  if (options.definitions) out = applyDefinitions(out, options.definitions);
  if (options.tags) out = applyTags(out, options.tags);
  return out;
}
