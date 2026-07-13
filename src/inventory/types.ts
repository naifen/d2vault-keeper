/**
 * Normalized vault item as Workbench lists it.
 * Names/tiers may be placeholders when Destiny manifest is unavailable.
 */

export interface VaultItem {
  /** Instance id (or synthetic key for non-instanced stacks). */
  id: string;
  itemHash: number;
  quantity: number;
  bucketHash: number;
  /** Display name — may be `#${itemHash}` without manifest. */
  name: string;
  /** Tier / rarity label if known. */
  tierType?: string;
  /** Item type / bucket label if known. */
  itemType?: string;
  power?: number;
  /** DIM tag if supplied by a later enricher (favorite, junk, …). */
  tag?: string;
  isExotic?: boolean;
}

export type InventoryStatus =
  | { state: "ok"; membershipId: string; items: VaultItem[]; source: "idb" }
  | {
      state: "empty";
      reason: "no-membership" | "no-profile" | "no-vault-items" | "no-light";
      message: string;
    }
  | { state: "error"; message: string };

/** Minimal Destiny profile inventory shapes we actually read. */
export interface DestinyItemComponentLike {
  itemHash: number;
  itemInstanceId?: string;
  quantity?: number;
  bucketHash?: number;
  /** Bungie ItemLocation: 2 = Vault */
  location?: number;
}

export interface DestinyProfileResponseLike {
  profileInventory?: {
    data?: {
      items?: DestinyItemComponentLike[];
    };
  };
  itemComponents?: {
    instances?: {
      data?: Record<string, { primaryStat?: { value?: number } }>;
    };
  };
}

/** Optional definition lookup (manifest / fixture). */
export interface ItemDefinitionLite {
  name?: string;
  tierTypeName?: string;
  itemTypeDisplayName?: string;
  /** Exotic tier type is 6 in Destiny enum. */
  tierType?: number;
}

export type DefinitionMap = ReadonlyMap<number, ItemDefinitionLite>;

/** Bungie ItemLocation.Vault */
export const ITEM_LOCATION_VAULT = 2;

/** Special Orders bucket excluded from vault store (DIM processVault). */
export const BUCKET_SPECIAL_ORDERS = 1368870543;
