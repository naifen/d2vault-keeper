/**
 * dim-api-profile tag semantics — single module for Favorite read + Mirror junk write.
 * Shape: profiles[`${membershipId}-d${version}`].tags[itemId].tag
 */

/** DIM idb-keyval key for local API profile / tags blob. */
export const DIM_API_PROFILE_KEY = "dim-api-profile";

/** Built-in DIM junk tag used by Mirror. */
export const JUNK_TAG = "junk" as const;

export type TagByItemId = ReadonlyMap<string, string>;

/** DIM account key: `${membershipId}-d${destinyVersion}`. */
export function dimAccountKey(membershipId: string, destinyVersion = 2): string {
  return `${membershipId}-d${destinyVersion}`;
}

/**
 * Whether a profiles{} account key belongs to membershipId.
 * Exact id or `${membershipId}-d…` prefix (not bare startsWith on id alone).
 */
export function accountKeyMatchesMembership(
  accountKey: string,
  membershipId: string,
): boolean {
  return (
    accountKey === membershipId || accountKey.startsWith(`${membershipId}-d`)
  );
}

/**
 * Parse DIM Sync / local dim-api-profile blob for per-instance tags.
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

  for (const [accountKey, profile] of Object.entries(profiles as Record<string, unknown>)) {
    if (membershipId && !accountKeyMatchesMembership(accountKey, membershipId)) {
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
 * Pure mutation of dim-api-profile for set/clear junk (or null clear).
 * Returns next profile blob (caller persists).
 */
export function mutateDimApiProfileTag(
  raw: unknown,
  itemId: string,
  tag: typeof JUNK_TAG | null,
  membershipId: string,
  destinyVersion = 2,
): { next: unknown; changed: boolean } {
  const key = dimAccountKey(membershipId, destinyVersion);
  const root: Record<string, unknown> =
    typeof raw === "object" && raw !== null ? { ...(raw as Record<string, unknown>) } : {};

  const profiles: Record<string, unknown> =
    typeof root.profiles === "object" && root.profiles !== null
      ? { ...(root.profiles as Record<string, unknown>) }
      : {};

  const profile: Record<string, unknown> =
    typeof profiles[key] === "object" && profiles[key] !== null
      ? { ...(profiles[key] as Record<string, unknown>) }
      : {};

  const tags: Record<string, unknown> =
    typeof profile.tags === "object" && profile.tags !== null
      ? { ...(profile.tags as Record<string, unknown>) }
      : {};

  const hadEntry = typeof tags[itemId] === "object" && tags[itemId] !== null;
  const existing: Record<string, unknown> = hadEntry
    ? { ...(tags[itemId] as Record<string, unknown>) }
    : { id: itemId };

  if (tag === null) {
    if (!hadEntry) {
      return { next: raw ?? root, changed: false };
    }
    if (existing.tag === JUNK_TAG) {
      delete existing.tag;
    } else if (existing.tag !== undefined) {
      return { next: raw ?? root, changed: false };
    }
    const hasNotes = typeof existing.notes === "string" && existing.notes.length > 0;
    if (!hasNotes && existing.tag === undefined) {
      delete tags[itemId];
    } else {
      tags[itemId] = existing;
    }
  } else {
    existing.id = itemId;
    existing.tag = tag;
    tags[itemId] = existing;
  }

  profile.tags = tags;
  profiles[key] = profile;
  root.profiles = profiles;
  return { next: root, changed: true };
}
