/**
 * Pure vault extraction from DestinyProfileResponse-like JSON.
 * Vault-only: ItemLocation.Vault on profileInventory, exclude Special Orders.
 * Aligns with research vault store id `vault` / isVault semantics (profile vault gear).
 */

import {
  BUCKET_SPECIAL_ORDERS,
  ITEM_LOCATION_VAULT,
  type DestinyItemComponentLike,
  type DestinyProfileResponseLike,
  type VaultItem,
} from "./types.js";

export interface ExtractOptions {
  /**
   * When true (default), keep items with location===Vault OR missing location
   * only if bucket is not Special Orders (legacy caches sometimes omit location).
   * When false, require location===Vault strictly.
   */
  allowMissingLocation?: boolean;
}

function isVaultItem(item: DestinyItemComponentLike, allowMissingLocation: boolean): boolean {
  if (item.bucketHash === BUCKET_SPECIAL_ORDERS) return false;
  if (item.location === ITEM_LOCATION_VAULT) return true;
  if (allowMissingLocation && (item.location === undefined || item.location === null)) {
    // Profile inventory without location: treat as vault candidate (DIM puts vault gear here).
    // Character-held gear lives under characterInventories, not profileInventory.
    return true;
  }
  return false;
}

function itemKey(item: DestinyItemComponentLike, index: number): string {
  if (item.itemInstanceId && item.itemInstanceId !== "0") {
    return item.itemInstanceId;
  }
  return `stack-${item.itemHash}-${item.bucketHash ?? 0}-${index}`;
}

/**
 * Vault membership + instance ids + power only.
 * Definition/tier/exotic/tag enrichment is owned by enrichVaultItems (one pass).
 */
export function extractVaultItems(
  profile: DestinyProfileResponseLike | null | undefined,
  options: ExtractOptions = {},
): VaultItem[] {
  if (!profile) return [];
  const allowMissingLocation = options.allowMissingLocation !== false;
  const raw = profile.profileInventory?.data?.items ?? [];
  const instances = profile.itemComponents?.instances?.data;

  const out: VaultItem[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item.itemHash !== "number") continue;
    if (!isVaultItem(item, allowMissingLocation)) continue;

    const id = itemKey(item, i);
    const power =
      item.itemInstanceId && instances?.[item.itemInstanceId]?.primaryStat?.value !== undefined
        ? instances[item.itemInstanceId]!.primaryStat!.value
        : undefined;

    const vaultItem: VaultItem = {
      id,
      itemHash: item.itemHash,
      quantity: item.quantity ?? 1,
      bucketHash: item.bucketHash ?? 0,
      name: `#${item.itemHash}`,
    };
    if (power !== undefined) vaultItem.power = power;

    out.push(vaultItem);
  }
  return out;
}

export function vaultItemCount(profile: DestinyProfileResponseLike | null | undefined): number {
  return extractVaultItems(profile).length;
}
