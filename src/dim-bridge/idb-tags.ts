/**
 * Real Mirror write path: mutate DIM's local `dim-api-profile` tags in IDB.
 * Same local store DIM uses before Sync flush — no Bungie OAuth.
 * Mockable via IdbKeyval injection.
 */

import type { IdbKeyval } from "../inventory/idb-reader.js";
import { DIM_API_PROFILE_KEY } from "../inventory/enrichment.js";
import type { TagDomHooks } from "./tags.js";
import { MIRROR_TAG } from "../mirror/index.js";

export interface DimApiProfileMutatorOptions {
  idb: IdbKeyval;
  membershipId: string;
  destinyVersion?: number;
}

function accountKey(membershipId: string, destinyVersion: number): string {
  return `${membershipId}-d${destinyVersion}`;
}

/**
 * Pure mutation of dim-api-profile object for set/clear junk.
 * Returns next profile blob (caller persists).
 */
export function mutateDimApiProfileTag(
  raw: unknown,
  itemId: string,
  tag: typeof MIRROR_TAG | null,
  membershipId: string,
  destinyVersion = 2,
): { next: unknown; changed: boolean } {
  const key = accountKey(membershipId, destinyVersion);
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

  const existing: Record<string, unknown> =
    typeof tags[itemId] === "object" && tags[itemId] !== null
      ? { ...(tags[itemId] as Record<string, unknown>) }
      : { id: itemId };

  if (tag === null) {
    // Clear junk only — leave other fields; remove annotation if empty.
    if (existing.tag === MIRROR_TAG || existing.tag === "junk") {
      delete existing.tag;
    } else if (existing.tag !== undefined) {
      // Different tag — do not clobber non-junk.
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

export function createIdbTagHooks(options: DimApiProfileMutatorOptions): TagDomHooks {
  const destinyVersion = options.destinyVersion ?? 2;
  return {
    async setTag(itemId: string, tag: typeof MIRROR_TAG | null): Promise<boolean> {
      if (!options.idb.set) {
        return false;
      }
      if (!itemId || itemId === "0") return false;
      const current = await options.idb.get(DIM_API_PROFILE_KEY);
      const { next, changed } = mutateDimApiProfileTag(
        current,
        itemId,
        tag,
        options.membershipId,
        destinyVersion,
      );
      if (!changed && tag === null) {
        // Nothing to clear — treat as success (policy already gated who we clear).
        return true;
      }
      await options.idb.set(DIM_API_PROFILE_KEY, next);
      return true;
    },
  };
}

/**
 * Build hooks that resolve membership from localStorage each call.
 */
export function createBrowserIdbTagHooks(
  idb: IdbKeyval,
  getMembershipId: () => string | null,
): TagDomHooks {
  return {
    async setTag(itemId, tag) {
      const membershipId = getMembershipId();
      if (!membershipId) return false;
      return createIdbTagHooks({ idb, membershipId }).setTag(itemId, tag);
    },
  };
}
