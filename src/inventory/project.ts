/**
 * Vault projection seam — identity + exclusion field carry for Stage / Agent / policy.
 * Pure maps only. Exclusion *policy* stays in trash/exclusions.
 */

import type { ExclusionSubject } from "../trash/exclusions.js";
import type { StageCandidate } from "../trash/types.js";

/** Minimal vault view accepted by projectors (full VaultItem or agent view). */
export type VaultProjectSource = {
  id: string;
  itemHash: number;
  name: string;
  tierType?: string;
  itemType?: string;
  isExotic?: boolean;
  tag?: string;
};

/** Map one vault row to a Stage candidate (exclusion fields preserved). */
export function toStageCandidate(item: VaultProjectSource): StageCandidate {
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
  vaultItems: readonly VaultProjectSource[],
  selectedIds: ReadonlySet<string>,
): StageCandidate[] {
  return vaultItems.filter((v) => selectedIds.has(v.id)).map(toStageCandidate);
}

/**
 * Compact exclusion fields for Favorite/Exotic policy.
 * Undefined when no exclusion signal is present.
 */
export function toExclusionFields(item: VaultProjectSource): ExclusionSubject | undefined {
  const fields: ExclusionSubject = {};
  if (item.tierType !== undefined) fields.tierType = item.tierType;
  if (item.tag !== undefined) fields.tag = item.tag;
  if (item.isExotic !== undefined) fields.isExotic = item.isExotic;
  return fields.tierType !== undefined || fields.tag !== undefined || fields.isExotic !== undefined
    ? fields
    : undefined;
}

/** LLM vault slice row — identity + exclusion signals only (no quantity/perks). */
export function toAgentVaultSliceRow(item: VaultProjectSource): {
  id: string;
  itemHash: number;
  name: string;
  tierType?: string;
  tag?: string;
  isExotic?: boolean;
} {
  const row: {
    id: string;
    itemHash: number;
    name: string;
    tierType?: string;
    tag?: string;
    isExotic?: boolean;
  } = {
    id: item.id,
    itemHash: item.itemHash,
    name: item.name,
  };
  if (item.tierType !== undefined) row.tierType = item.tierType;
  if (item.tag !== undefined) row.tag = item.tag;
  if (item.isExotic !== undefined) row.isExotic = item.isExotic;
  return row;
}

/** Build full-vault exclusion index (not slice-capped). */
export function exclusionByIdFromVault(
  items: readonly VaultProjectSource[],
): Record<string, ExclusionSubject> | undefined {
  const map: Record<string, ExclusionSubject> = {};
  let any = false;
  for (const v of items) {
    const fields = toExclusionFields(v);
    if (fields) {
      map[v.id] = fields;
      any = true;
    }
  }
  return any ? map : undefined;
}
