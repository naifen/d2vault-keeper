/**
 * Trash SoT — extension-owned staged set. Not Destiny deletion.
 */

export type MirrorStatus = "ok" | "pending" | "failed" | "none";

export interface TrashRecord {
  id: string;
  itemHash: number;
  name: string;
  stagedAt: number;
  /** True when Vault Keeper applied DIM junk tag for this row. */
  mirrorAppliedByUs: boolean;
  mirrorStatus: MirrorStatus;
  tierType?: string;
  itemType?: string;
  isExotic?: boolean;
  tag?: string;
}

export interface StageCandidate {
  id: string;
  itemHash: number;
  name: string;
  tierType?: string;
  itemType?: string;
  isExotic?: boolean;
  tag?: string;
}

export type StageDenialReason = "exotic" | "favorite" | "already-staged";

export interface StageResult {
  staged: TrashRecord[];
  denied: Array<{ id: string; reason: StageDenialReason }>;
}

export interface TrashState {
  version: 1;
  items: TrashRecord[];
}

export const TRASH_STORAGE_KEY = "vault-keeper-trash";
