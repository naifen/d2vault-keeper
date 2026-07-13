/**
 * Pure Vault item → StageCandidate mapping.
 * Single source so Workbench UI and tests cannot drop exclusion fields.
 */

import type { VaultItem } from "../inventory/index.js";
import type { StageCandidate } from "../trash/index.js";

/** Map one Vault item to a Stage candidate (exclusion fields preserved). */
export function toStageCandidate(item: VaultItem): StageCandidate {
  const candidate: StageCandidate = {
    id: item.id,
    itemHash: item.itemHash,
    name: item.name,
  };
  if (item.tierType !== undefined) candidate.tierType = item.tierType;
  if (item.itemType !== undefined) candidate.itemType = item.itemType;
  if (item.isExotic !== undefined) candidate.isExotic = item.isExotic;
  if (item.tag !== undefined) candidate.tag = item.tag;
  return candidate;
}

/** Stage candidates for the current vault selection. */
export function selectedStageCandidates(
  vaultItems: readonly VaultItem[],
  selectedIds: ReadonlySet<string>,
): StageCandidate[] {
  return vaultItems.filter((v) => selectedIds.has(v.id)).map(toStageCandidate);
}
