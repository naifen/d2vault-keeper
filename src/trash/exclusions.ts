/**
 * Default Stage exclusions: exotic + DIM favorite.
 * Never auto-stage protected gear.
 */

import type { StageCandidate, StageDenialReason } from "./types.js";

export function isFavoriteTagged(tag: string | undefined | null): boolean {
  return (tag ?? "").toLowerCase() === "favorite";
}

export function isExoticItem(candidate: Pick<StageCandidate, "isExotic" | "tierType">): boolean {
  if (candidate.isExotic === true) return true;
  const tier = (candidate.tierType ?? "").toLowerCase();
  return tier === "exotic";
}

export function stageDenialReason(candidate: StageCandidate): StageDenialReason | null {
  if (isExoticItem(candidate)) return "exotic";
  if (isFavoriteTagged(candidate.tag)) return "favorite";
  return null;
}

export function canStageDefault(candidate: StageCandidate): boolean {
  return stageDenialReason(candidate) === null;
}
