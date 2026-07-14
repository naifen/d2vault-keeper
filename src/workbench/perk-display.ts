/**
 * Pure display helpers for Results perk hover/focus.
 * Honest empty state when enrichment did not supply perks — never invents names.
 */

export const PERKS_UNKNOWN_LABEL = "Perks unknown";

/**
 * Human-readable perk line for title/aria on a Results row.
 * - Present non-empty perks → joined display names
 * - Absent / empty → honest unknown label
 */
export function formatPerkHoverLine(perks: readonly string[] | undefined | null): string {
  if (!perks || perks.length === 0) return PERKS_UNKNOWN_LABEL;
  const names = perks.map((p) => p.trim()).filter(Boolean);
  if (names.length === 0) return PERKS_UNKNOWN_LABEL;
  return names.join(" · ");
}

/**
 * Whether the row has real enriched perk names to surface.
 */
export function hasKnownPerks(perks: readonly string[] | undefined | null): boolean {
  return Boolean(perks?.some((p) => p.trim().length > 0));
}
