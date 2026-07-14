/**
 * Favorite + Exotic exclusion policy (product hard rules).
 * One module for Stage denials and Agent recommendation post-filter.
 * Prompt text may remind the model; this module enforces.
 */

import type { StageCandidate, StageDenialReason } from "./types.js";

/** Fields needed to decide exclusion — Stage candidates or vault-enriched recs. */
export type ExclusionSubject = {
  isExotic?: boolean;
  tierType?: string;
  tag?: string;
};

export function isFavoriteTagged(tag: string | undefined | null): boolean {
  return (tag ?? "").toLowerCase() === "favorite";
}

export function isExoticItem(subject: Pick<ExclusionSubject, "isExotic" | "tierType">): boolean {
  if (subject.isExotic === true) return true;
  const tier = (subject.tierType ?? "").toLowerCase();
  return tier === "exotic";
}

/**
 * Denial reason for default Stage / recommendation exclusion.
 * Does not cover already-staged (Stage-path only).
 */
export function exclusionDenialReason(subject: ExclusionSubject): "exotic" | "favorite" | null {
  if (isExoticItem(subject)) return "exotic";
  if (isFavoriteTagged(subject.tag)) return "favorite";
  return null;
}

export function stageDenialReason(candidate: StageCandidate): StageDenialReason | null {
  return exclusionDenialReason(candidate);
}

export function canStageDefault(candidate: StageCandidate): boolean {
  return exclusionDenialReason(candidate) === null;
}

/**
 * Drop recommendations that violate Favorite/Exotic exclusion.
 * When `resolve` is provided (e.g. vault slice by id), merge lookup fields with the rec.
 * Unknown subjects (no exclusion fields) pass through — cannot invent protection.
 */
export function filterExcludedRecommendations<
  T extends { id: string } & ExclusionSubject,
>(recs: readonly T[], resolve?: (id: string) => ExclusionSubject | undefined): T[] {
  return recs.filter((rec) => {
    const looked = resolve?.(rec.id);
    const subject: ExclusionSubject = {};
    const isExotic = rec.isExotic ?? looked?.isExotic;
    const tierType = rec.tierType ?? looked?.tierType;
    const tag = rec.tag ?? looked?.tag;
    if (isExotic !== undefined) subject.isExotic = isExotic;
    if (tierType !== undefined) subject.tierType = tierType;
    if (tag !== undefined) subject.tag = tag;
    return exclusionDenialReason(subject) === null;
  });
}
