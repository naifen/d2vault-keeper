/**
 * Background → Light messaging MirrorBridge adapter.
 * Second production adapter at the MirrorBridge seam (page IDB is the other).
 */

import type { MirrorBridge } from "../mirror/index.js";

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
