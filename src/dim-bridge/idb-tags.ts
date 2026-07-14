/**
 * Page/IDB MirrorBridge adapter.
 * Membership resolve + dim-api-profile mutate + IDB write in one place.
 * Pure blob rules live in dim-api-profile (shared with Favorite tag read).
 */

import type { IdbKeyval } from "../inventory/idb-reader.js";
import {
  DIM_API_PROFILE_KEY,
  JUNK_TAG,
  mutateDimApiProfileTag,
} from "../dim-api-profile/index.js";
import type { MirrorBridge } from "../mirror/index.js";

export interface IdbMirrorBridgeOptions {
  idb: IdbKeyval;
  membershipId: string;
  destinyVersion?: number;
}

async function writeJunkTag(
  options: IdbMirrorBridgeOptions,
  itemId: string,
  tag: typeof JUNK_TAG | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!options.idb.set) {
    return { ok: false, error: "IDB set unavailable" };
  }
  if (!itemId || itemId === "0") {
    return { ok: false, error: "invalid item id" };
  }
  const destinyVersion = options.destinyVersion ?? 2;
  try {
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
      return { ok: true };
    }
    await options.idb.set(DIM_API_PROFILE_KEY, next);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Fixed-membership IDB Mirror adapter (tests + explicit membership). */
export function createIdbMirrorBridge(options: IdbMirrorBridgeOptions): MirrorBridge {
  return {
    async setJunkTag(itemId: string) {
      return writeJunkTag(options, itemId, JUNK_TAG);
    },
    async clearJunkTag(itemId: string) {
      return writeJunkTag(options, itemId, null);
    },
  };
}

/**
 * Page production adapter: resolve membership from localStorage each call,
 * then write junk via dim-api-profile + IDB.
 */
export function createBrowserIdbMirrorBridge(
  idb: IdbKeyval,
  getMembershipId: () => string | null,
): MirrorBridge {
  return {
    async setJunkTag(itemId: string) {
      const membershipId = getMembershipId();
      if (!membershipId) return { ok: false, error: "membership unavailable" };
      return createIdbMirrorBridge({ idb, membershipId }).setJunkTag(itemId);
    },
    async clearJunkTag(itemId: string) {
      const membershipId = getMembershipId();
      if (!membershipId) return { ok: false, error: "membership unavailable" };
      return createIdbMirrorBridge({ idb, membershipId }).clearJunkTag(itemId);
    },
  };
}
