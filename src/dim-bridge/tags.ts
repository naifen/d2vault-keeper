/**
 * Best-effort junk tag apply via page DOM/events.
 * Mockable for unit tests — production path is soft-fail when UI unavailable.
 */

import type { MirrorBridge } from "../mirror/index.js";
import { MIRROR_TAG } from "../mirror/index.js";

export interface TagDomHooks {
  /** Try set built-in tag on an item by instance id. */
  setTag(itemId: string, tag: typeof MIRROR_TAG | null): Promise<boolean>;
}

/** Default: no stable public DOM tag API — report failure without throwing. */
export function createSoftFailTagHooks(): TagDomHooks {
  return {
    async setTag() {
      // v1: Mirror is best-effort. Real DOM/Redux tag write is environment-dependent.
      // Returning false keeps Trash intact (policy). Light may replace with richer hook later.
      return false;
    },
  };
}

export function createMirrorBridgeFromHooks(hooks: TagDomHooks): MirrorBridge {
  return {
    async setJunkTag(itemId: string) {
      try {
        const ok = await hooks.setTag(itemId, MIRROR_TAG);
        return ok ? { ok: true } : { ok: false, error: "junk tag apply unavailable in page" };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    async clearJunkTag(itemId: string) {
      try {
        const ok = await hooks.setTag(itemId, null);
        return ok ? { ok: true } : { ok: false, error: "junk tag clear unavailable in page" };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

/** Messaging-based bridge: background asks Light to set/clear tags. */
export function createMessagingMirrorBridge(
  sendToLight: (kind: "mirror-set" | "mirror-clear", itemId: string) => Promise<boolean>,
): MirrorBridge {
  return {
    async setJunkTag(itemId) {
      try {
        const ok = await sendToLight("mirror-set", itemId);
        return ok ? { ok: true } : { ok: false, error: "mirror-set failed" };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    async clearJunkTag(itemId) {
      try {
        const ok = await sendToLight("mirror-clear", itemId);
        return ok ? { ok: true } : { ok: false, error: "mirror-clear failed" };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
