/**
 * Mirror write path: persist junk tags via dim-api-profile mutator + IdbKeyval.
 * Pure blob rules live in dim-api-profile (shared with Favorite tag read).
 */

import type { IdbKeyval } from "../inventory/idb-reader.js";
import {
  DIM_API_PROFILE_KEY,
  JUNK_TAG,
  mutateDimApiProfileTag,
} from "../dim-api-profile/index.js";
import type { TagDomHooks } from "./tags.js";

export interface DimApiProfileMutatorOptions {
  idb: IdbKeyval;
  membershipId: string;
  destinyVersion?: number;
}

export function createIdbTagHooks(options: DimApiProfileMutatorOptions): TagDomHooks {
  const destinyVersion = options.destinyVersion ?? 2;
  return {
    async setTag(itemId: string, tag: typeof JUNK_TAG | null): Promise<boolean> {
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
