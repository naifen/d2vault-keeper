/**
 * Resolve DIM profile cache key from membership id / localStorage hints.
 * Research: localStorage `dim-last-membership-id` → IDB key `profile-${membershipId}`.
 */

export const LAST_MEMBERSHIP_KEY = "dim-last-membership-id";

export function membershipProfileKey(membershipId: string): string {
  if (!membershipId || membershipId.trim() === "") {
    throw new Error("membershipId is required");
  }
  return `profile-${membershipId.trim()}`;
}

export function resolveMembershipId(
  getItem: (key: string) => string | null,
): string | null {
  const raw = getItem(LAST_MEMBERSHIP_KEY);
  if (raw === null || raw === undefined) return null;
  const id = String(raw).trim();
  return id === "" ? null : id;
}

/** Parse profile-* keys to membership ids (fallback when last-membership missing). */
export function membershipIdFromProfileKey(key: string): string | null {
  const m = /^profile-(.+)$/.exec(key);
  return m?.[1] ?? null;
}
